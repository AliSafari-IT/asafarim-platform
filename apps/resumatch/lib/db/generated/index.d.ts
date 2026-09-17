
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Workspace
 * A candidate's JobMatch workspace, keyed by the opaque platform user id.
 * Holds no name, email, or other platform profile data — those are read
 * from the session at request time and never persisted here.
 */
export type Workspace = $Result.DefaultSelection<Prisma.$WorkspacePayload>
/**
 * Model AuditEvent
 * Append-only record of consequential actions inside a workspace.
 * 
 * M1 seeds the table and the write path so that every later milestone has
 * somewhere to record data-rights actions (JM-023) and connector runs
 * (JM-031) from day one. `metadata` is a redacted, allow-listed JSON blob:
 * CV text, extracted personal data, and secrets must never reach it.
 */
export type AuditEvent = $Result.DefaultSelection<Prisma.$AuditEventPayload>
/**
 * Model CandidateDocument
 * An uploaded CV. The bytes live in private object storage; this row holds
 * only metadata and the audit trail.
 */
export type CandidateDocument = $Result.DefaultSelection<Prisma.$CandidateDocumentPayload>
/**
 * Model CandidateProfile
 * The candidate's current profile pointer. One per workspace. Holds no
 * profile data itself — the data lives in immutable versions, and this row
 * only records which version is in force.
 */
export type CandidateProfile = $Result.DefaultSelection<Prisma.$CandidateProfilePayload>
/**
 * Model CandidateProfileVersion
 * An immutable snapshot of a candidate profile.
 * 
 * Rows here are never updated after creation — a correction creates a new
 * version pointing at its parent. That is what makes a past match
 * explainable: the exact profile that produced it still exists, alongside
 * the document hash and parser version that produced *it*.
 */
export type CandidateProfileVersion = $Result.DefaultSelection<Prisma.$CandidateProfileVersionPayload>
/**
 * Model TargetJob
 * One job posting a candidate is tailoring their CV toward.
 */
export type TargetJob = $Result.DefaultSelection<Prisma.$TargetJobPayload>
/**
 * Model TailoredResume
 * One AI tailoring result: a candidate's confirmed profile version,
 * rewritten and reprioritized toward one TargetJob.
 */
export type TailoredResume = $Result.DefaultSelection<Prisma.$TailoredResumePayload>
/**
 * Model AiUsageLedger
 * Append-only spend ledger for ResuMatch's AI provider calls. Mirrors
 * apps/tasks-ai/lib/ai/quota.ts's AiUsageLedger (see that schema's own
 * AiUsageLedger model), adapted to ResuMatch's isolated schema.
 */
export type AiUsageLedger = $Result.DefaultSelection<Prisma.$AiUsageLedgerPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const DocumentStatus: {
  UPLOADED: 'UPLOADED',
  SCANNING: 'SCANNING',
  QUARANTINED: 'QUARANTINED',
  CLEAN: 'CLEAN',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  FAILED: 'FAILED'
};

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus]


export const DocumentReasonCode: {
  MALWARE_DETECTED: 'MALWARE_DETECTED',
  SCANNER_UNAVAILABLE: 'SCANNER_UNAVAILABLE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  DECLARED_TYPE_MISMATCH: 'DECLARED_TYPE_MISMATCH',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  EMPTY_FILE: 'EMPTY_FILE',
  ENCRYPTED_DOCUMENT: 'ENCRYPTED_DOCUMENT',
  NO_TEXT_LAYER: 'NO_TEXT_LAYER',
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  LAYOUT_UNRELIABLE: 'LAYOUT_UNRELIABLE',
  BYTES_MISSING: 'BYTES_MISSING'
};

export type DocumentReasonCode = (typeof DocumentReasonCode)[keyof typeof DocumentReasonCode]


export const ProfileVersionOrigin: {
  EXTRACTED: 'EXTRACTED',
  CORRECTED: 'CORRECTED',
  MANUAL: 'MANUAL'
};

export type ProfileVersionOrigin = (typeof ProfileVersionOrigin)[keyof typeof ProfileVersionOrigin]


export const TargetJobStatus: {
  FETCHED: 'FETCHED',
  FETCH_FAILED: 'FETCH_FAILED'
};

export type TargetJobStatus = (typeof TargetJobStatus)[keyof typeof TargetJobStatus]

}

export type DocumentStatus = $Enums.DocumentStatus

export const DocumentStatus: typeof $Enums.DocumentStatus

export type DocumentReasonCode = $Enums.DocumentReasonCode

export const DocumentReasonCode: typeof $Enums.DocumentReasonCode

export type ProfileVersionOrigin = $Enums.ProfileVersionOrigin

export const ProfileVersionOrigin: typeof $Enums.ProfileVersionOrigin

export type TargetJobStatus = $Enums.TargetJobStatus

export const TargetJobStatus: typeof $Enums.TargetJobStatus

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more Workspaces
 * const workspaces = await prisma.workspace.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more Workspaces
   * const workspaces = await prisma.workspace.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.workspace`: Exposes CRUD operations for the **Workspace** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Workspaces
    * const workspaces = await prisma.workspace.findMany()
    * ```
    */
  get workspace(): Prisma.WorkspaceDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.auditEvent`: Exposes CRUD operations for the **AuditEvent** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AuditEvents
    * const auditEvents = await prisma.auditEvent.findMany()
    * ```
    */
  get auditEvent(): Prisma.AuditEventDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.candidateDocument`: Exposes CRUD operations for the **CandidateDocument** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CandidateDocuments
    * const candidateDocuments = await prisma.candidateDocument.findMany()
    * ```
    */
  get candidateDocument(): Prisma.CandidateDocumentDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.candidateProfile`: Exposes CRUD operations for the **CandidateProfile** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CandidateProfiles
    * const candidateProfiles = await prisma.candidateProfile.findMany()
    * ```
    */
  get candidateProfile(): Prisma.CandidateProfileDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.candidateProfileVersion`: Exposes CRUD operations for the **CandidateProfileVersion** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CandidateProfileVersions
    * const candidateProfileVersions = await prisma.candidateProfileVersion.findMany()
    * ```
    */
  get candidateProfileVersion(): Prisma.CandidateProfileVersionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.targetJob`: Exposes CRUD operations for the **TargetJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TargetJobs
    * const targetJobs = await prisma.targetJob.findMany()
    * ```
    */
  get targetJob(): Prisma.TargetJobDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tailoredResume`: Exposes CRUD operations for the **TailoredResume** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TailoredResumes
    * const tailoredResumes = await prisma.tailoredResume.findMany()
    * ```
    */
  get tailoredResume(): Prisma.TailoredResumeDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.aiUsageLedger`: Exposes CRUD operations for the **AiUsageLedger** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AiUsageLedgers
    * const aiUsageLedgers = await prisma.aiUsageLedger.findMany()
    * ```
    */
  get aiUsageLedger(): Prisma.AiUsageLedgerDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.8.0
   * Query Engine version: 3c6e192761c0362d496ed980de936e2f3cebcd3a
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Workspace: 'Workspace',
    AuditEvent: 'AuditEvent',
    CandidateDocument: 'CandidateDocument',
    CandidateProfile: 'CandidateProfile',
    CandidateProfileVersion: 'CandidateProfileVersion',
    TargetJob: 'TargetJob',
    TailoredResume: 'TailoredResume',
    AiUsageLedger: 'AiUsageLedger'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "workspace" | "auditEvent" | "candidateDocument" | "candidateProfile" | "candidateProfileVersion" | "targetJob" | "tailoredResume" | "aiUsageLedger"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Workspace: {
        payload: Prisma.$WorkspacePayload<ExtArgs>
        fields: Prisma.WorkspaceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findFirst: {
            args: Prisma.WorkspaceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findMany: {
            args: Prisma.WorkspaceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          create: {
            args: Prisma.WorkspaceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          createMany: {
            args: Prisma.WorkspaceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          delete: {
            args: Prisma.WorkspaceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          update: {
            args: Prisma.WorkspaceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          aggregate: {
            args: Prisma.WorkspaceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspace>
          }
          groupBy: {
            args: Prisma.WorkspaceGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceCountAggregateOutputType> | number
          }
        }
      }
      AuditEvent: {
        payload: Prisma.$AuditEventPayload<ExtArgs>
        fields: Prisma.AuditEventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AuditEventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AuditEventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          findFirst: {
            args: Prisma.AuditEventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AuditEventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          findMany: {
            args: Prisma.AuditEventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          create: {
            args: Prisma.AuditEventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          createMany: {
            args: Prisma.AuditEventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AuditEventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          delete: {
            args: Prisma.AuditEventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          update: {
            args: Prisma.AuditEventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          deleteMany: {
            args: Prisma.AuditEventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AuditEventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AuditEventUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          upsert: {
            args: Prisma.AuditEventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          aggregate: {
            args: Prisma.AuditEventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAuditEvent>
          }
          groupBy: {
            args: Prisma.AuditEventGroupByArgs<ExtArgs>
            result: $Utils.Optional<AuditEventGroupByOutputType>[]
          }
          count: {
            args: Prisma.AuditEventCountArgs<ExtArgs>
            result: $Utils.Optional<AuditEventCountAggregateOutputType> | number
          }
        }
      }
      CandidateDocument: {
        payload: Prisma.$CandidateDocumentPayload<ExtArgs>
        fields: Prisma.CandidateDocumentFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CandidateDocumentFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CandidateDocumentFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          findFirst: {
            args: Prisma.CandidateDocumentFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CandidateDocumentFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          findMany: {
            args: Prisma.CandidateDocumentFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>[]
          }
          create: {
            args: Prisma.CandidateDocumentCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          createMany: {
            args: Prisma.CandidateDocumentCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CandidateDocumentCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>[]
          }
          delete: {
            args: Prisma.CandidateDocumentDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          update: {
            args: Prisma.CandidateDocumentUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          deleteMany: {
            args: Prisma.CandidateDocumentDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CandidateDocumentUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CandidateDocumentUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>[]
          }
          upsert: {
            args: Prisma.CandidateDocumentUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateDocumentPayload>
          }
          aggregate: {
            args: Prisma.CandidateDocumentAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCandidateDocument>
          }
          groupBy: {
            args: Prisma.CandidateDocumentGroupByArgs<ExtArgs>
            result: $Utils.Optional<CandidateDocumentGroupByOutputType>[]
          }
          count: {
            args: Prisma.CandidateDocumentCountArgs<ExtArgs>
            result: $Utils.Optional<CandidateDocumentCountAggregateOutputType> | number
          }
        }
      }
      CandidateProfile: {
        payload: Prisma.$CandidateProfilePayload<ExtArgs>
        fields: Prisma.CandidateProfileFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CandidateProfileFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CandidateProfileFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          findFirst: {
            args: Prisma.CandidateProfileFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CandidateProfileFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          findMany: {
            args: Prisma.CandidateProfileFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>[]
          }
          create: {
            args: Prisma.CandidateProfileCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          createMany: {
            args: Prisma.CandidateProfileCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CandidateProfileCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>[]
          }
          delete: {
            args: Prisma.CandidateProfileDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          update: {
            args: Prisma.CandidateProfileUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          deleteMany: {
            args: Prisma.CandidateProfileDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CandidateProfileUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CandidateProfileUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>[]
          }
          upsert: {
            args: Prisma.CandidateProfileUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfilePayload>
          }
          aggregate: {
            args: Prisma.CandidateProfileAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCandidateProfile>
          }
          groupBy: {
            args: Prisma.CandidateProfileGroupByArgs<ExtArgs>
            result: $Utils.Optional<CandidateProfileGroupByOutputType>[]
          }
          count: {
            args: Prisma.CandidateProfileCountArgs<ExtArgs>
            result: $Utils.Optional<CandidateProfileCountAggregateOutputType> | number
          }
        }
      }
      CandidateProfileVersion: {
        payload: Prisma.$CandidateProfileVersionPayload<ExtArgs>
        fields: Prisma.CandidateProfileVersionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CandidateProfileVersionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CandidateProfileVersionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          findFirst: {
            args: Prisma.CandidateProfileVersionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CandidateProfileVersionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          findMany: {
            args: Prisma.CandidateProfileVersionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>[]
          }
          create: {
            args: Prisma.CandidateProfileVersionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          createMany: {
            args: Prisma.CandidateProfileVersionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CandidateProfileVersionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>[]
          }
          delete: {
            args: Prisma.CandidateProfileVersionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          update: {
            args: Prisma.CandidateProfileVersionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          deleteMany: {
            args: Prisma.CandidateProfileVersionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CandidateProfileVersionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CandidateProfileVersionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>[]
          }
          upsert: {
            args: Prisma.CandidateProfileVersionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CandidateProfileVersionPayload>
          }
          aggregate: {
            args: Prisma.CandidateProfileVersionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCandidateProfileVersion>
          }
          groupBy: {
            args: Prisma.CandidateProfileVersionGroupByArgs<ExtArgs>
            result: $Utils.Optional<CandidateProfileVersionGroupByOutputType>[]
          }
          count: {
            args: Prisma.CandidateProfileVersionCountArgs<ExtArgs>
            result: $Utils.Optional<CandidateProfileVersionCountAggregateOutputType> | number
          }
        }
      }
      TargetJob: {
        payload: Prisma.$TargetJobPayload<ExtArgs>
        fields: Prisma.TargetJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TargetJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TargetJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          findFirst: {
            args: Prisma.TargetJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TargetJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          findMany: {
            args: Prisma.TargetJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>[]
          }
          create: {
            args: Prisma.TargetJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          createMany: {
            args: Prisma.TargetJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TargetJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>[]
          }
          delete: {
            args: Prisma.TargetJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          update: {
            args: Prisma.TargetJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          deleteMany: {
            args: Prisma.TargetJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TargetJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TargetJobUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>[]
          }
          upsert: {
            args: Prisma.TargetJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TargetJobPayload>
          }
          aggregate: {
            args: Prisma.TargetJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTargetJob>
          }
          groupBy: {
            args: Prisma.TargetJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<TargetJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.TargetJobCountArgs<ExtArgs>
            result: $Utils.Optional<TargetJobCountAggregateOutputType> | number
          }
        }
      }
      TailoredResume: {
        payload: Prisma.$TailoredResumePayload<ExtArgs>
        fields: Prisma.TailoredResumeFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TailoredResumeFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TailoredResumeFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          findFirst: {
            args: Prisma.TailoredResumeFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TailoredResumeFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          findMany: {
            args: Prisma.TailoredResumeFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>[]
          }
          create: {
            args: Prisma.TailoredResumeCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          createMany: {
            args: Prisma.TailoredResumeCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TailoredResumeCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>[]
          }
          delete: {
            args: Prisma.TailoredResumeDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          update: {
            args: Prisma.TailoredResumeUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          deleteMany: {
            args: Prisma.TailoredResumeDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TailoredResumeUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TailoredResumeUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>[]
          }
          upsert: {
            args: Prisma.TailoredResumeUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TailoredResumePayload>
          }
          aggregate: {
            args: Prisma.TailoredResumeAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTailoredResume>
          }
          groupBy: {
            args: Prisma.TailoredResumeGroupByArgs<ExtArgs>
            result: $Utils.Optional<TailoredResumeGroupByOutputType>[]
          }
          count: {
            args: Prisma.TailoredResumeCountArgs<ExtArgs>
            result: $Utils.Optional<TailoredResumeCountAggregateOutputType> | number
          }
        }
      }
      AiUsageLedger: {
        payload: Prisma.$AiUsageLedgerPayload<ExtArgs>
        fields: Prisma.AiUsageLedgerFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AiUsageLedgerFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AiUsageLedgerFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          findFirst: {
            args: Prisma.AiUsageLedgerFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AiUsageLedgerFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          findMany: {
            args: Prisma.AiUsageLedgerFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>[]
          }
          create: {
            args: Prisma.AiUsageLedgerCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          createMany: {
            args: Prisma.AiUsageLedgerCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AiUsageLedgerCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>[]
          }
          delete: {
            args: Prisma.AiUsageLedgerDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          update: {
            args: Prisma.AiUsageLedgerUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          deleteMany: {
            args: Prisma.AiUsageLedgerDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AiUsageLedgerUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AiUsageLedgerUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>[]
          }
          upsert: {
            args: Prisma.AiUsageLedgerUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AiUsageLedgerPayload>
          }
          aggregate: {
            args: Prisma.AiUsageLedgerAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAiUsageLedger>
          }
          groupBy: {
            args: Prisma.AiUsageLedgerGroupByArgs<ExtArgs>
            result: $Utils.Optional<AiUsageLedgerGroupByOutputType>[]
          }
          count: {
            args: Prisma.AiUsageLedgerCountArgs<ExtArgs>
            result: $Utils.Optional<AiUsageLedgerCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    workspace?: WorkspaceOmit
    auditEvent?: AuditEventOmit
    candidateDocument?: CandidateDocumentOmit
    candidateProfile?: CandidateProfileOmit
    candidateProfileVersion?: CandidateProfileVersionOmit
    targetJob?: TargetJobOmit
    tailoredResume?: TailoredResumeOmit
    aiUsageLedger?: AiUsageLedgerOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type WorkspaceCountOutputType
   */

  export type WorkspaceCountOutputType = {
    auditEvents: number
    documents: number
    targetJobs: number
    tailoredResumes: number
  }

  export type WorkspaceCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    auditEvents?: boolean | WorkspaceCountOutputTypeCountAuditEventsArgs
    documents?: boolean | WorkspaceCountOutputTypeCountDocumentsArgs
    targetJobs?: boolean | WorkspaceCountOutputTypeCountTargetJobsArgs
    tailoredResumes?: boolean | WorkspaceCountOutputTypeCountTailoredResumesArgs
  }

  // Custom InputTypes
  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceCountOutputType
     */
    select?: WorkspaceCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountAuditEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditEventWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountDocumentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateDocumentWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountTargetJobsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TargetJobWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountTailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TailoredResumeWhereInput
  }


  /**
   * Count Type CandidateDocumentCountOutputType
   */

  export type CandidateDocumentCountOutputType = {
    profileVersions: number
  }

  export type CandidateDocumentCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    profileVersions?: boolean | CandidateDocumentCountOutputTypeCountProfileVersionsArgs
  }

  // Custom InputTypes
  /**
   * CandidateDocumentCountOutputType without action
   */
  export type CandidateDocumentCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocumentCountOutputType
     */
    select?: CandidateDocumentCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CandidateDocumentCountOutputType without action
   */
  export type CandidateDocumentCountOutputTypeCountProfileVersionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateProfileVersionWhereInput
  }


  /**
   * Count Type CandidateProfileCountOutputType
   */

  export type CandidateProfileCountOutputType = {
    versions: number
  }

  export type CandidateProfileCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    versions?: boolean | CandidateProfileCountOutputTypeCountVersionsArgs
  }

  // Custom InputTypes
  /**
   * CandidateProfileCountOutputType without action
   */
  export type CandidateProfileCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileCountOutputType
     */
    select?: CandidateProfileCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CandidateProfileCountOutputType without action
   */
  export type CandidateProfileCountOutputTypeCountVersionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateProfileVersionWhereInput
  }


  /**
   * Count Type CandidateProfileVersionCountOutputType
   */

  export type CandidateProfileVersionCountOutputType = {
    children: number
    tailoredResumes: number
  }

  export type CandidateProfileVersionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    children?: boolean | CandidateProfileVersionCountOutputTypeCountChildrenArgs
    tailoredResumes?: boolean | CandidateProfileVersionCountOutputTypeCountTailoredResumesArgs
  }

  // Custom InputTypes
  /**
   * CandidateProfileVersionCountOutputType without action
   */
  export type CandidateProfileVersionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersionCountOutputType
     */
    select?: CandidateProfileVersionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CandidateProfileVersionCountOutputType without action
   */
  export type CandidateProfileVersionCountOutputTypeCountChildrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateProfileVersionWhereInput
  }

  /**
   * CandidateProfileVersionCountOutputType without action
   */
  export type CandidateProfileVersionCountOutputTypeCountTailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TailoredResumeWhereInput
  }


  /**
   * Count Type TargetJobCountOutputType
   */

  export type TargetJobCountOutputType = {
    tailoredResumes: number
  }

  export type TargetJobCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tailoredResumes?: boolean | TargetJobCountOutputTypeCountTailoredResumesArgs
  }

  // Custom InputTypes
  /**
   * TargetJobCountOutputType without action
   */
  export type TargetJobCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJobCountOutputType
     */
    select?: TargetJobCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * TargetJobCountOutputType without action
   */
  export type TargetJobCountOutputTypeCountTailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TailoredResumeWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Workspace
   */

  export type AggregateWorkspace = {
    _count: WorkspaceCountAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  export type WorkspaceMinAggregateOutputType = {
    id: string | null
    platformUserId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceMaxAggregateOutputType = {
    id: string | null
    platformUserId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceCountAggregateOutputType = {
    id: number
    platformUserId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkspaceMinAggregateInputType = {
    id?: true
    platformUserId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceMaxAggregateInputType = {
    id?: true
    platformUserId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceCountAggregateInputType = {
    id?: true
    platformUserId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkspaceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspace to aggregate.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Workspaces
    **/
    _count?: true | WorkspaceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceMaxAggregateInputType
  }

  export type GetWorkspaceAggregateType<T extends WorkspaceAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspace]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspace[P]>
      : GetScalarType<T[P], AggregateWorkspace[P]>
  }




  export type WorkspaceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithAggregationInput | WorkspaceOrderByWithAggregationInput[]
    by: WorkspaceScalarFieldEnum[] | WorkspaceScalarFieldEnum
    having?: WorkspaceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceCountAggregateInputType | true
    _min?: WorkspaceMinAggregateInputType
    _max?: WorkspaceMaxAggregateInputType
  }

  export type WorkspaceGroupByOutputType = {
    id: string
    platformUserId: string
    createdAt: Date
    updatedAt: Date
    _count: WorkspaceCountAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  type GetWorkspaceGroupByPayload<T extends WorkspaceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    platformUserId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    auditEvents?: boolean | Workspace$auditEventsArgs<ExtArgs>
    documents?: boolean | Workspace$documentsArgs<ExtArgs>
    profile?: boolean | Workspace$profileArgs<ExtArgs>
    targetJobs?: boolean | Workspace$targetJobsArgs<ExtArgs>
    tailoredResumes?: boolean | Workspace$tailoredResumesArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    platformUserId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    platformUserId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectScalar = {
    id?: boolean
    platformUserId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkspaceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "platformUserId" | "createdAt" | "updatedAt", ExtArgs["result"]["workspace"]>
  export type WorkspaceInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    auditEvents?: boolean | Workspace$auditEventsArgs<ExtArgs>
    documents?: boolean | Workspace$documentsArgs<ExtArgs>
    profile?: boolean | Workspace$profileArgs<ExtArgs>
    targetJobs?: boolean | Workspace$targetJobsArgs<ExtArgs>
    tailoredResumes?: boolean | Workspace$tailoredResumesArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type WorkspaceIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type WorkspaceIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $WorkspacePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Workspace"
    objects: {
      auditEvents: Prisma.$AuditEventPayload<ExtArgs>[]
      documents: Prisma.$CandidateDocumentPayload<ExtArgs>[]
      profile: Prisma.$CandidateProfilePayload<ExtArgs> | null
      targetJobs: Prisma.$TargetJobPayload<ExtArgs>[]
      tailoredResumes: Prisma.$TailoredResumePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      /**
       * Opaque platform user id (Auth.js `session.user.id`). Unique: one
       * workspace per authenticated user.
       */
      platformUserId: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["workspace"]>
    composites: {}
  }

  type WorkspaceGetPayload<S extends boolean | null | undefined | WorkspaceDefaultArgs> = $Result.GetResult<Prisma.$WorkspacePayload, S>

  type WorkspaceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceCountAggregateInputType | true
    }

  export interface WorkspaceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Workspace'], meta: { name: 'Workspace' } }
    /**
     * Find zero or one Workspace that matches the filter.
     * @param {WorkspaceFindUniqueArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceFindUniqueArgs>(args: SelectSubset<T, WorkspaceFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Workspace that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceFindUniqueOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceFindFirstArgs>(args?: SelectSubset<T, WorkspaceFindFirstArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Workspaces that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Workspaces
     * const workspaces = await prisma.workspace.findMany()
     * 
     * // Get first 10 Workspaces
     * const workspaces = await prisma.workspace.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceWithIdOnly = await prisma.workspace.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceFindManyArgs>(args?: SelectSubset<T, WorkspaceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Workspace.
     * @param {WorkspaceCreateArgs} args - Arguments to create a Workspace.
     * @example
     * // Create one Workspace
     * const Workspace = await prisma.workspace.create({
     *   data: {
     *     // ... data to create a Workspace
     *   }
     * })
     * 
     */
    create<T extends WorkspaceCreateArgs>(args: SelectSubset<T, WorkspaceCreateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Workspaces.
     * @param {WorkspaceCreateManyArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceCreateManyArgs>(args?: SelectSubset<T, WorkspaceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Workspaces and returns the data saved in the database.
     * @param {WorkspaceCreateManyAndReturnArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Workspace.
     * @param {WorkspaceDeleteArgs} args - Arguments to delete one Workspace.
     * @example
     * // Delete one Workspace
     * const Workspace = await prisma.workspace.delete({
     *   where: {
     *     // ... filter to delete one Workspace
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceDeleteArgs>(args: SelectSubset<T, WorkspaceDeleteArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Workspace.
     * @param {WorkspaceUpdateArgs} args - Arguments to update one Workspace.
     * @example
     * // Update one Workspace
     * const workspace = await prisma.workspace.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceUpdateArgs>(args: SelectSubset<T, WorkspaceUpdateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Workspaces.
     * @param {WorkspaceDeleteManyArgs} args - Arguments to filter Workspaces to delete.
     * @example
     * // Delete a few Workspaces
     * const { count } = await prisma.workspace.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceDeleteManyArgs>(args?: SelectSubset<T, WorkspaceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceUpdateManyArgs>(args: SelectSubset<T, WorkspaceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces and returns the data updated in the database.
     * @param {WorkspaceUpdateManyAndReturnArgs} args - Arguments to update many Workspaces.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Workspace.
     * @param {WorkspaceUpsertArgs} args - Arguments to update or create a Workspace.
     * @example
     * // Update or create a Workspace
     * const workspace = await prisma.workspace.upsert({
     *   create: {
     *     // ... data to create a Workspace
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Workspace we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceUpsertArgs>(args: SelectSubset<T, WorkspaceUpsertArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceCountArgs} args - Arguments to filter Workspaces to count.
     * @example
     * // Count the number of Workspaces
     * const count = await prisma.workspace.count({
     *   where: {
     *     // ... the filter for the Workspaces we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceCountArgs>(
      args?: Subset<T, WorkspaceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceAggregateArgs>(args: Subset<T, WorkspaceAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceAggregateType<T>>

    /**
     * Group by Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Workspace model
   */
  readonly fields: WorkspaceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Workspace.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    auditEvents<T extends Workspace$auditEventsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$auditEventsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    documents<T extends Workspace$documentsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$documentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    profile<T extends Workspace$profileArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$profileArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    targetJobs<T extends Workspace$targetJobsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$targetJobsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    tailoredResumes<T extends Workspace$tailoredResumesArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$tailoredResumesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Workspace model
   */
  interface WorkspaceFieldRefs {
    readonly id: FieldRef<"Workspace", 'String'>
    readonly platformUserId: FieldRef<"Workspace", 'String'>
    readonly createdAt: FieldRef<"Workspace", 'DateTime'>
    readonly updatedAt: FieldRef<"Workspace", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Workspace findUnique
   */
  export type WorkspaceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findUniqueOrThrow
   */
  export type WorkspaceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findFirst
   */
  export type WorkspaceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findFirstOrThrow
   */
  export type WorkspaceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findMany
   */
  export type WorkspaceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspaces to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace create
   */
  export type WorkspaceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to create a Workspace.
     */
    data: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
  }

  /**
   * Workspace createMany
   */
  export type WorkspaceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Workspace createManyAndReturn
   */
  export type WorkspaceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Workspace update
   */
  export type WorkspaceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to update a Workspace.
     */
    data: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
    /**
     * Choose, which Workspace to update.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace updateMany
   */
  export type WorkspaceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
  }

  /**
   * Workspace updateManyAndReturn
   */
  export type WorkspaceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
  }

  /**
   * Workspace upsert
   */
  export type WorkspaceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The filter to search for the Workspace to update in case it exists.
     */
    where: WorkspaceWhereUniqueInput
    /**
     * In case the Workspace found by the `where` argument doesn't exist, create a new Workspace with this data.
     */
    create: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
    /**
     * In case the Workspace was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
  }

  /**
   * Workspace delete
   */
  export type WorkspaceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter which Workspace to delete.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace deleteMany
   */
  export type WorkspaceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspaces to delete
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to delete.
     */
    limit?: number
  }

  /**
   * Workspace.auditEvents
   */
  export type Workspace$auditEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    where?: AuditEventWhereInput
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    cursor?: AuditEventWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * Workspace.documents
   */
  export type Workspace$documentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    where?: CandidateDocumentWhereInput
    orderBy?: CandidateDocumentOrderByWithRelationInput | CandidateDocumentOrderByWithRelationInput[]
    cursor?: CandidateDocumentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CandidateDocumentScalarFieldEnum | CandidateDocumentScalarFieldEnum[]
  }

  /**
   * Workspace.profile
   */
  export type Workspace$profileArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    where?: CandidateProfileWhereInput
  }

  /**
   * Workspace.targetJobs
   */
  export type Workspace$targetJobsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    where?: TargetJobWhereInput
    orderBy?: TargetJobOrderByWithRelationInput | TargetJobOrderByWithRelationInput[]
    cursor?: TargetJobWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TargetJobScalarFieldEnum | TargetJobScalarFieldEnum[]
  }

  /**
   * Workspace.tailoredResumes
   */
  export type Workspace$tailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    where?: TailoredResumeWhereInput
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    cursor?: TailoredResumeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * Workspace without action
   */
  export type WorkspaceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
  }


  /**
   * Model AuditEvent
   */

  export type AggregateAuditEvent = {
    _count: AuditEventCountAggregateOutputType | null
    _min: AuditEventMinAggregateOutputType | null
    _max: AuditEventMaxAggregateOutputType | null
  }

  export type AuditEventMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    action: string | null
    createdAt: Date | null
  }

  export type AuditEventMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    action: string | null
    createdAt: Date | null
  }

  export type AuditEventCountAggregateOutputType = {
    id: number
    workspaceId: number
    action: number
    metadata: number
    createdAt: number
    _all: number
  }


  export type AuditEventMinAggregateInputType = {
    id?: true
    workspaceId?: true
    action?: true
    createdAt?: true
  }

  export type AuditEventMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    action?: true
    createdAt?: true
  }

  export type AuditEventCountAggregateInputType = {
    id?: true
    workspaceId?: true
    action?: true
    metadata?: true
    createdAt?: true
    _all?: true
  }

  export type AuditEventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditEvent to aggregate.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AuditEvents
    **/
    _count?: true | AuditEventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AuditEventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AuditEventMaxAggregateInputType
  }

  export type GetAuditEventAggregateType<T extends AuditEventAggregateArgs> = {
        [P in keyof T & keyof AggregateAuditEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAuditEvent[P]>
      : GetScalarType<T[P], AggregateAuditEvent[P]>
  }




  export type AuditEventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditEventWhereInput
    orderBy?: AuditEventOrderByWithAggregationInput | AuditEventOrderByWithAggregationInput[]
    by: AuditEventScalarFieldEnum[] | AuditEventScalarFieldEnum
    having?: AuditEventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AuditEventCountAggregateInputType | true
    _min?: AuditEventMinAggregateInputType
    _max?: AuditEventMaxAggregateInputType
  }

  export type AuditEventGroupByOutputType = {
    id: string
    workspaceId: string | null
    action: string
    metadata: JsonValue | null
    createdAt: Date
    _count: AuditEventCountAggregateOutputType | null
    _min: AuditEventMinAggregateOutputType | null
    _max: AuditEventMaxAggregateOutputType | null
  }

  type GetAuditEventGroupByPayload<T extends AuditEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AuditEventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AuditEventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AuditEventGroupByOutputType[P]>
            : GetScalarType<T[P], AuditEventGroupByOutputType[P]>
        }
      >
    >


  export type AuditEventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    action?: boolean
    metadata?: boolean
    createdAt?: boolean
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    action?: boolean
    metadata?: boolean
    createdAt?: boolean
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    action?: boolean
    metadata?: boolean
    createdAt?: boolean
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    action?: boolean
    metadata?: boolean
    createdAt?: boolean
  }

  export type AuditEventOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "action" | "metadata" | "createdAt", ExtArgs["result"]["auditEvent"]>
  export type AuditEventInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }
  export type AuditEventIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }
  export type AuditEventIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | AuditEvent$workspaceArgs<ExtArgs>
  }

  export type $AuditEventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AuditEvent"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string | null
      /**
       * Stable dotted action name, e.g. "workspace.created".
       */
      action: string
      /**
       * Redacted, allow-listed structured context. Never raw documents.
       */
      metadata: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["auditEvent"]>
    composites: {}
  }

  type AuditEventGetPayload<S extends boolean | null | undefined | AuditEventDefaultArgs> = $Result.GetResult<Prisma.$AuditEventPayload, S>

  type AuditEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AuditEventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AuditEventCountAggregateInputType | true
    }

  export interface AuditEventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AuditEvent'], meta: { name: 'AuditEvent' } }
    /**
     * Find zero or one AuditEvent that matches the filter.
     * @param {AuditEventFindUniqueArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AuditEventFindUniqueArgs>(args: SelectSubset<T, AuditEventFindUniqueArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AuditEvent that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AuditEventFindUniqueOrThrowArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AuditEventFindUniqueOrThrowArgs>(args: SelectSubset<T, AuditEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindFirstArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AuditEventFindFirstArgs>(args?: SelectSubset<T, AuditEventFindFirstArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindFirstOrThrowArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AuditEventFindFirstOrThrowArgs>(args?: SelectSubset<T, AuditEventFindFirstOrThrowArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AuditEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AuditEvents
     * const auditEvents = await prisma.auditEvent.findMany()
     * 
     * // Get first 10 AuditEvents
     * const auditEvents = await prisma.auditEvent.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AuditEventFindManyArgs>(args?: SelectSubset<T, AuditEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AuditEvent.
     * @param {AuditEventCreateArgs} args - Arguments to create a AuditEvent.
     * @example
     * // Create one AuditEvent
     * const AuditEvent = await prisma.auditEvent.create({
     *   data: {
     *     // ... data to create a AuditEvent
     *   }
     * })
     * 
     */
    create<T extends AuditEventCreateArgs>(args: SelectSubset<T, AuditEventCreateArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AuditEvents.
     * @param {AuditEventCreateManyArgs} args - Arguments to create many AuditEvents.
     * @example
     * // Create many AuditEvents
     * const auditEvent = await prisma.auditEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AuditEventCreateManyArgs>(args?: SelectSubset<T, AuditEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AuditEvents and returns the data saved in the database.
     * @param {AuditEventCreateManyAndReturnArgs} args - Arguments to create many AuditEvents.
     * @example
     * // Create many AuditEvents
     * const auditEvent = await prisma.auditEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AuditEvents and only return the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AuditEventCreateManyAndReturnArgs>(args?: SelectSubset<T, AuditEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AuditEvent.
     * @param {AuditEventDeleteArgs} args - Arguments to delete one AuditEvent.
     * @example
     * // Delete one AuditEvent
     * const AuditEvent = await prisma.auditEvent.delete({
     *   where: {
     *     // ... filter to delete one AuditEvent
     *   }
     * })
     * 
     */
    delete<T extends AuditEventDeleteArgs>(args: SelectSubset<T, AuditEventDeleteArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AuditEvent.
     * @param {AuditEventUpdateArgs} args - Arguments to update one AuditEvent.
     * @example
     * // Update one AuditEvent
     * const auditEvent = await prisma.auditEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AuditEventUpdateArgs>(args: SelectSubset<T, AuditEventUpdateArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AuditEvents.
     * @param {AuditEventDeleteManyArgs} args - Arguments to filter AuditEvents to delete.
     * @example
     * // Delete a few AuditEvents
     * const { count } = await prisma.auditEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AuditEventDeleteManyArgs>(args?: SelectSubset<T, AuditEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AuditEvents
     * const auditEvent = await prisma.auditEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AuditEventUpdateManyArgs>(args: SelectSubset<T, AuditEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditEvents and returns the data updated in the database.
     * @param {AuditEventUpdateManyAndReturnArgs} args - Arguments to update many AuditEvents.
     * @example
     * // Update many AuditEvents
     * const auditEvent = await prisma.auditEvent.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AuditEvents and only return the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AuditEventUpdateManyAndReturnArgs>(args: SelectSubset<T, AuditEventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AuditEvent.
     * @param {AuditEventUpsertArgs} args - Arguments to update or create a AuditEvent.
     * @example
     * // Update or create a AuditEvent
     * const auditEvent = await prisma.auditEvent.upsert({
     *   create: {
     *     // ... data to create a AuditEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AuditEvent we want to update
     *   }
     * })
     */
    upsert<T extends AuditEventUpsertArgs>(args: SelectSubset<T, AuditEventUpsertArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AuditEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventCountArgs} args - Arguments to filter AuditEvents to count.
     * @example
     * // Count the number of AuditEvents
     * const count = await prisma.auditEvent.count({
     *   where: {
     *     // ... the filter for the AuditEvents we want to count
     *   }
     * })
    **/
    count<T extends AuditEventCountArgs>(
      args?: Subset<T, AuditEventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AuditEventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AuditEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AuditEventAggregateArgs>(args: Subset<T, AuditEventAggregateArgs>): Prisma.PrismaPromise<GetAuditEventAggregateType<T>>

    /**
     * Group by AuditEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AuditEventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AuditEventGroupByArgs['orderBy'] }
        : { orderBy?: AuditEventGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AuditEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAuditEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AuditEvent model
   */
  readonly fields: AuditEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AuditEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AuditEventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends AuditEvent$workspaceArgs<ExtArgs> = {}>(args?: Subset<T, AuditEvent$workspaceArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AuditEvent model
   */
  interface AuditEventFieldRefs {
    readonly id: FieldRef<"AuditEvent", 'String'>
    readonly workspaceId: FieldRef<"AuditEvent", 'String'>
    readonly action: FieldRef<"AuditEvent", 'String'>
    readonly metadata: FieldRef<"AuditEvent", 'Json'>
    readonly createdAt: FieldRef<"AuditEvent", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AuditEvent findUnique
   */
  export type AuditEventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent findUniqueOrThrow
   */
  export type AuditEventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent findFirst
   */
  export type AuditEventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditEvents.
     */
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent findFirstOrThrow
   */
  export type AuditEventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditEvents.
     */
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent findMany
   */
  export type AuditEventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvents to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditEvents.
     */
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent create
   */
  export type AuditEventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The data needed to create a AuditEvent.
     */
    data: XOR<AuditEventCreateInput, AuditEventUncheckedCreateInput>
  }

  /**
   * AuditEvent createMany
   */
  export type AuditEventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AuditEvents.
     */
    data: AuditEventCreateManyInput | AuditEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditEvent createManyAndReturn
   */
  export type AuditEventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * The data used to create many AuditEvents.
     */
    data: AuditEventCreateManyInput | AuditEventCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AuditEvent update
   */
  export type AuditEventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The data needed to update a AuditEvent.
     */
    data: XOR<AuditEventUpdateInput, AuditEventUncheckedUpdateInput>
    /**
     * Choose, which AuditEvent to update.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent updateMany
   */
  export type AuditEventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AuditEvents.
     */
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyInput>
    /**
     * Filter which AuditEvents to update
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to update.
     */
    limit?: number
  }

  /**
   * AuditEvent updateManyAndReturn
   */
  export type AuditEventUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * The data used to update AuditEvents.
     */
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyInput>
    /**
     * Filter which AuditEvents to update
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * AuditEvent upsert
   */
  export type AuditEventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The filter to search for the AuditEvent to update in case it exists.
     */
    where: AuditEventWhereUniqueInput
    /**
     * In case the AuditEvent found by the `where` argument doesn't exist, create a new AuditEvent with this data.
     */
    create: XOR<AuditEventCreateInput, AuditEventUncheckedCreateInput>
    /**
     * In case the AuditEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AuditEventUpdateInput, AuditEventUncheckedUpdateInput>
  }

  /**
   * AuditEvent delete
   */
  export type AuditEventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter which AuditEvent to delete.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent deleteMany
   */
  export type AuditEventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditEvents to delete
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to delete.
     */
    limit?: number
  }

  /**
   * AuditEvent.workspace
   */
  export type AuditEvent$workspaceArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
  }

  /**
   * AuditEvent without action
   */
  export type AuditEventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
  }


  /**
   * Model CandidateDocument
   */

  export type AggregateCandidateDocument = {
    _count: CandidateDocumentCountAggregateOutputType | null
    _avg: CandidateDocumentAvgAggregateOutputType | null
    _sum: CandidateDocumentSumAggregateOutputType | null
    _min: CandidateDocumentMinAggregateOutputType | null
    _max: CandidateDocumentMaxAggregateOutputType | null
  }

  export type CandidateDocumentAvgAggregateOutputType = {
    byteSize: number | null
    extractionAttempts: number | null
  }

  export type CandidateDocumentSumAggregateOutputType = {
    byteSize: number | null
    extractionAttempts: number | null
  }

  export type CandidateDocumentMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    storageKey: string | null
    originalFilename: string | null
    contentType: string | null
    byteSize: number | null
    contentHash: string | null
    status: $Enums.DocumentStatus | null
    reasonCode: $Enums.DocumentReasonCode | null
    scannerName: string | null
    scannedAt: Date | null
    extractionAttempts: number | null
    extractionStartedAt: Date | null
    retainUntil: Date | null
    uploadedAt: Date | null
    deletedAt: Date | null
  }

  export type CandidateDocumentMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    storageKey: string | null
    originalFilename: string | null
    contentType: string | null
    byteSize: number | null
    contentHash: string | null
    status: $Enums.DocumentStatus | null
    reasonCode: $Enums.DocumentReasonCode | null
    scannerName: string | null
    scannedAt: Date | null
    extractionAttempts: number | null
    extractionStartedAt: Date | null
    retainUntil: Date | null
    uploadedAt: Date | null
    deletedAt: Date | null
  }

  export type CandidateDocumentCountAggregateOutputType = {
    id: number
    workspaceId: number
    storageKey: number
    originalFilename: number
    contentType: number
    byteSize: number
    contentHash: number
    status: number
    reasonCode: number
    scannerName: number
    scannedAt: number
    extractionAttempts: number
    extractionStartedAt: number
    retainUntil: number
    uploadedAt: number
    deletedAt: number
    _all: number
  }


  export type CandidateDocumentAvgAggregateInputType = {
    byteSize?: true
    extractionAttempts?: true
  }

  export type CandidateDocumentSumAggregateInputType = {
    byteSize?: true
    extractionAttempts?: true
  }

  export type CandidateDocumentMinAggregateInputType = {
    id?: true
    workspaceId?: true
    storageKey?: true
    originalFilename?: true
    contentType?: true
    byteSize?: true
    contentHash?: true
    status?: true
    reasonCode?: true
    scannerName?: true
    scannedAt?: true
    extractionAttempts?: true
    extractionStartedAt?: true
    retainUntil?: true
    uploadedAt?: true
    deletedAt?: true
  }

  export type CandidateDocumentMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    storageKey?: true
    originalFilename?: true
    contentType?: true
    byteSize?: true
    contentHash?: true
    status?: true
    reasonCode?: true
    scannerName?: true
    scannedAt?: true
    extractionAttempts?: true
    extractionStartedAt?: true
    retainUntil?: true
    uploadedAt?: true
    deletedAt?: true
  }

  export type CandidateDocumentCountAggregateInputType = {
    id?: true
    workspaceId?: true
    storageKey?: true
    originalFilename?: true
    contentType?: true
    byteSize?: true
    contentHash?: true
    status?: true
    reasonCode?: true
    scannerName?: true
    scannedAt?: true
    extractionAttempts?: true
    extractionStartedAt?: true
    retainUntil?: true
    uploadedAt?: true
    deletedAt?: true
    _all?: true
  }

  export type CandidateDocumentAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateDocument to aggregate.
     */
    where?: CandidateDocumentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateDocuments to fetch.
     */
    orderBy?: CandidateDocumentOrderByWithRelationInput | CandidateDocumentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CandidateDocumentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateDocuments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateDocuments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CandidateDocuments
    **/
    _count?: true | CandidateDocumentCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: CandidateDocumentAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: CandidateDocumentSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CandidateDocumentMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CandidateDocumentMaxAggregateInputType
  }

  export type GetCandidateDocumentAggregateType<T extends CandidateDocumentAggregateArgs> = {
        [P in keyof T & keyof AggregateCandidateDocument]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCandidateDocument[P]>
      : GetScalarType<T[P], AggregateCandidateDocument[P]>
  }




  export type CandidateDocumentGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateDocumentWhereInput
    orderBy?: CandidateDocumentOrderByWithAggregationInput | CandidateDocumentOrderByWithAggregationInput[]
    by: CandidateDocumentScalarFieldEnum[] | CandidateDocumentScalarFieldEnum
    having?: CandidateDocumentScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CandidateDocumentCountAggregateInputType | true
    _avg?: CandidateDocumentAvgAggregateInputType
    _sum?: CandidateDocumentSumAggregateInputType
    _min?: CandidateDocumentMinAggregateInputType
    _max?: CandidateDocumentMaxAggregateInputType
  }

  export type CandidateDocumentGroupByOutputType = {
    id: string
    workspaceId: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status: $Enums.DocumentStatus
    reasonCode: $Enums.DocumentReasonCode | null
    scannerName: string | null
    scannedAt: Date | null
    extractionAttempts: number
    extractionStartedAt: Date | null
    retainUntil: Date | null
    uploadedAt: Date
    deletedAt: Date | null
    _count: CandidateDocumentCountAggregateOutputType | null
    _avg: CandidateDocumentAvgAggregateOutputType | null
    _sum: CandidateDocumentSumAggregateOutputType | null
    _min: CandidateDocumentMinAggregateOutputType | null
    _max: CandidateDocumentMaxAggregateOutputType | null
  }

  type GetCandidateDocumentGroupByPayload<T extends CandidateDocumentGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CandidateDocumentGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CandidateDocumentGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CandidateDocumentGroupByOutputType[P]>
            : GetScalarType<T[P], CandidateDocumentGroupByOutputType[P]>
        }
      >
    >


  export type CandidateDocumentSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    storageKey?: boolean
    originalFilename?: boolean
    contentType?: boolean
    byteSize?: boolean
    contentHash?: boolean
    status?: boolean
    reasonCode?: boolean
    scannerName?: boolean
    scannedAt?: boolean
    extractionAttempts?: boolean
    extractionStartedAt?: boolean
    retainUntil?: boolean
    uploadedAt?: boolean
    deletedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersions?: boolean | CandidateDocument$profileVersionsArgs<ExtArgs>
    _count?: boolean | CandidateDocumentCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["candidateDocument"]>

  export type CandidateDocumentSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    storageKey?: boolean
    originalFilename?: boolean
    contentType?: boolean
    byteSize?: boolean
    contentHash?: boolean
    status?: boolean
    reasonCode?: boolean
    scannerName?: boolean
    scannedAt?: boolean
    extractionAttempts?: boolean
    extractionStartedAt?: boolean
    retainUntil?: boolean
    uploadedAt?: boolean
    deletedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["candidateDocument"]>

  export type CandidateDocumentSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    storageKey?: boolean
    originalFilename?: boolean
    contentType?: boolean
    byteSize?: boolean
    contentHash?: boolean
    status?: boolean
    reasonCode?: boolean
    scannerName?: boolean
    scannedAt?: boolean
    extractionAttempts?: boolean
    extractionStartedAt?: boolean
    retainUntil?: boolean
    uploadedAt?: boolean
    deletedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["candidateDocument"]>

  export type CandidateDocumentSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    storageKey?: boolean
    originalFilename?: boolean
    contentType?: boolean
    byteSize?: boolean
    contentHash?: boolean
    status?: boolean
    reasonCode?: boolean
    scannerName?: boolean
    scannedAt?: boolean
    extractionAttempts?: boolean
    extractionStartedAt?: boolean
    retainUntil?: boolean
    uploadedAt?: boolean
    deletedAt?: boolean
  }

  export type CandidateDocumentOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "storageKey" | "originalFilename" | "contentType" | "byteSize" | "contentHash" | "status" | "reasonCode" | "scannerName" | "scannedAt" | "extractionAttempts" | "extractionStartedAt" | "retainUntil" | "uploadedAt" | "deletedAt", ExtArgs["result"]["candidateDocument"]>
  export type CandidateDocumentInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersions?: boolean | CandidateDocument$profileVersionsArgs<ExtArgs>
    _count?: boolean | CandidateDocumentCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CandidateDocumentIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }
  export type CandidateDocumentIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }

  export type $CandidateDocumentPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CandidateDocument"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      profileVersions: Prisma.$CandidateProfileVersionPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      /**
       * Object-storage key. Always prefixed with the workspace id so a key
       * cannot be guessed across tenants, and never exposed to the client.
       */
      storageKey: string
      /**
       * The user's own filename, kept for display only. Never used to build a
       * storage key or a filesystem path.
       */
      originalFilename: string
      /**
       * Content type as *sniffed from the bytes*, not as declared by the
       * browser. See lib/documents/fileType.ts.
       */
      contentType: string
      byteSize: number
      /**
       * SHA-256 of the stored bytes — the anchor that makes a profile version
       * reproducible, and the way a re-upload of the same CV is recognised.
       */
      contentHash: string
      status: $Enums.DocumentStatus
      reasonCode: $Enums.DocumentReasonCode | null
      /**
       * Scanner name and verdict time, so a stale "clean" is visible as stale.
       */
      scannerName: string | null
      scannedAt: Date | null
      /**
       * Retry accounting for extraction. Bounded so a malformed document
       * cannot be retried forever.
       */
      extractionAttempts: number
      extractionStartedAt: Date | null
      /**
       * When the stored bytes become eligible for deletion (JM-017 retention).
       */
      retainUntil: Date | null
      uploadedAt: Date
      deletedAt: Date | null
    }, ExtArgs["result"]["candidateDocument"]>
    composites: {}
  }

  type CandidateDocumentGetPayload<S extends boolean | null | undefined | CandidateDocumentDefaultArgs> = $Result.GetResult<Prisma.$CandidateDocumentPayload, S>

  type CandidateDocumentCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CandidateDocumentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CandidateDocumentCountAggregateInputType | true
    }

  export interface CandidateDocumentDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CandidateDocument'], meta: { name: 'CandidateDocument' } }
    /**
     * Find zero or one CandidateDocument that matches the filter.
     * @param {CandidateDocumentFindUniqueArgs} args - Arguments to find a CandidateDocument
     * @example
     * // Get one CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CandidateDocumentFindUniqueArgs>(args: SelectSubset<T, CandidateDocumentFindUniqueArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one CandidateDocument that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CandidateDocumentFindUniqueOrThrowArgs} args - Arguments to find a CandidateDocument
     * @example
     * // Get one CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CandidateDocumentFindUniqueOrThrowArgs>(args: SelectSubset<T, CandidateDocumentFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateDocument that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentFindFirstArgs} args - Arguments to find a CandidateDocument
     * @example
     * // Get one CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CandidateDocumentFindFirstArgs>(args?: SelectSubset<T, CandidateDocumentFindFirstArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateDocument that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentFindFirstOrThrowArgs} args - Arguments to find a CandidateDocument
     * @example
     * // Get one CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CandidateDocumentFindFirstOrThrowArgs>(args?: SelectSubset<T, CandidateDocumentFindFirstOrThrowArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more CandidateDocuments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CandidateDocuments
     * const candidateDocuments = await prisma.candidateDocument.findMany()
     * 
     * // Get first 10 CandidateDocuments
     * const candidateDocuments = await prisma.candidateDocument.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const candidateDocumentWithIdOnly = await prisma.candidateDocument.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CandidateDocumentFindManyArgs>(args?: SelectSubset<T, CandidateDocumentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a CandidateDocument.
     * @param {CandidateDocumentCreateArgs} args - Arguments to create a CandidateDocument.
     * @example
     * // Create one CandidateDocument
     * const CandidateDocument = await prisma.candidateDocument.create({
     *   data: {
     *     // ... data to create a CandidateDocument
     *   }
     * })
     * 
     */
    create<T extends CandidateDocumentCreateArgs>(args: SelectSubset<T, CandidateDocumentCreateArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many CandidateDocuments.
     * @param {CandidateDocumentCreateManyArgs} args - Arguments to create many CandidateDocuments.
     * @example
     * // Create many CandidateDocuments
     * const candidateDocument = await prisma.candidateDocument.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CandidateDocumentCreateManyArgs>(args?: SelectSubset<T, CandidateDocumentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CandidateDocuments and returns the data saved in the database.
     * @param {CandidateDocumentCreateManyAndReturnArgs} args - Arguments to create many CandidateDocuments.
     * @example
     * // Create many CandidateDocuments
     * const candidateDocument = await prisma.candidateDocument.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CandidateDocuments and only return the `id`
     * const candidateDocumentWithIdOnly = await prisma.candidateDocument.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CandidateDocumentCreateManyAndReturnArgs>(args?: SelectSubset<T, CandidateDocumentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a CandidateDocument.
     * @param {CandidateDocumentDeleteArgs} args - Arguments to delete one CandidateDocument.
     * @example
     * // Delete one CandidateDocument
     * const CandidateDocument = await prisma.candidateDocument.delete({
     *   where: {
     *     // ... filter to delete one CandidateDocument
     *   }
     * })
     * 
     */
    delete<T extends CandidateDocumentDeleteArgs>(args: SelectSubset<T, CandidateDocumentDeleteArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one CandidateDocument.
     * @param {CandidateDocumentUpdateArgs} args - Arguments to update one CandidateDocument.
     * @example
     * // Update one CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CandidateDocumentUpdateArgs>(args: SelectSubset<T, CandidateDocumentUpdateArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more CandidateDocuments.
     * @param {CandidateDocumentDeleteManyArgs} args - Arguments to filter CandidateDocuments to delete.
     * @example
     * // Delete a few CandidateDocuments
     * const { count } = await prisma.candidateDocument.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CandidateDocumentDeleteManyArgs>(args?: SelectSubset<T, CandidateDocumentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateDocuments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CandidateDocuments
     * const candidateDocument = await prisma.candidateDocument.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CandidateDocumentUpdateManyArgs>(args: SelectSubset<T, CandidateDocumentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateDocuments and returns the data updated in the database.
     * @param {CandidateDocumentUpdateManyAndReturnArgs} args - Arguments to update many CandidateDocuments.
     * @example
     * // Update many CandidateDocuments
     * const candidateDocument = await prisma.candidateDocument.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CandidateDocuments and only return the `id`
     * const candidateDocumentWithIdOnly = await prisma.candidateDocument.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CandidateDocumentUpdateManyAndReturnArgs>(args: SelectSubset<T, CandidateDocumentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one CandidateDocument.
     * @param {CandidateDocumentUpsertArgs} args - Arguments to update or create a CandidateDocument.
     * @example
     * // Update or create a CandidateDocument
     * const candidateDocument = await prisma.candidateDocument.upsert({
     *   create: {
     *     // ... data to create a CandidateDocument
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CandidateDocument we want to update
     *   }
     * })
     */
    upsert<T extends CandidateDocumentUpsertArgs>(args: SelectSubset<T, CandidateDocumentUpsertArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of CandidateDocuments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentCountArgs} args - Arguments to filter CandidateDocuments to count.
     * @example
     * // Count the number of CandidateDocuments
     * const count = await prisma.candidateDocument.count({
     *   where: {
     *     // ... the filter for the CandidateDocuments we want to count
     *   }
     * })
    **/
    count<T extends CandidateDocumentCountArgs>(
      args?: Subset<T, CandidateDocumentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CandidateDocumentCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CandidateDocument.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CandidateDocumentAggregateArgs>(args: Subset<T, CandidateDocumentAggregateArgs>): Prisma.PrismaPromise<GetCandidateDocumentAggregateType<T>>

    /**
     * Group by CandidateDocument.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateDocumentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CandidateDocumentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CandidateDocumentGroupByArgs['orderBy'] }
        : { orderBy?: CandidateDocumentGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CandidateDocumentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCandidateDocumentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CandidateDocument model
   */
  readonly fields: CandidateDocumentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CandidateDocument.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CandidateDocumentClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    profileVersions<T extends CandidateDocument$profileVersionsArgs<ExtArgs> = {}>(args?: Subset<T, CandidateDocument$profileVersionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CandidateDocument model
   */
  interface CandidateDocumentFieldRefs {
    readonly id: FieldRef<"CandidateDocument", 'String'>
    readonly workspaceId: FieldRef<"CandidateDocument", 'String'>
    readonly storageKey: FieldRef<"CandidateDocument", 'String'>
    readonly originalFilename: FieldRef<"CandidateDocument", 'String'>
    readonly contentType: FieldRef<"CandidateDocument", 'String'>
    readonly byteSize: FieldRef<"CandidateDocument", 'Int'>
    readonly contentHash: FieldRef<"CandidateDocument", 'String'>
    readonly status: FieldRef<"CandidateDocument", 'DocumentStatus'>
    readonly reasonCode: FieldRef<"CandidateDocument", 'DocumentReasonCode'>
    readonly scannerName: FieldRef<"CandidateDocument", 'String'>
    readonly scannedAt: FieldRef<"CandidateDocument", 'DateTime'>
    readonly extractionAttempts: FieldRef<"CandidateDocument", 'Int'>
    readonly extractionStartedAt: FieldRef<"CandidateDocument", 'DateTime'>
    readonly retainUntil: FieldRef<"CandidateDocument", 'DateTime'>
    readonly uploadedAt: FieldRef<"CandidateDocument", 'DateTime'>
    readonly deletedAt: FieldRef<"CandidateDocument", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CandidateDocument findUnique
   */
  export type CandidateDocumentFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter, which CandidateDocument to fetch.
     */
    where: CandidateDocumentWhereUniqueInput
  }

  /**
   * CandidateDocument findUniqueOrThrow
   */
  export type CandidateDocumentFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter, which CandidateDocument to fetch.
     */
    where: CandidateDocumentWhereUniqueInput
  }

  /**
   * CandidateDocument findFirst
   */
  export type CandidateDocumentFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter, which CandidateDocument to fetch.
     */
    where?: CandidateDocumentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateDocuments to fetch.
     */
    orderBy?: CandidateDocumentOrderByWithRelationInput | CandidateDocumentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateDocuments.
     */
    cursor?: CandidateDocumentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateDocuments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateDocuments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateDocuments.
     */
    distinct?: CandidateDocumentScalarFieldEnum | CandidateDocumentScalarFieldEnum[]
  }

  /**
   * CandidateDocument findFirstOrThrow
   */
  export type CandidateDocumentFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter, which CandidateDocument to fetch.
     */
    where?: CandidateDocumentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateDocuments to fetch.
     */
    orderBy?: CandidateDocumentOrderByWithRelationInput | CandidateDocumentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateDocuments.
     */
    cursor?: CandidateDocumentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateDocuments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateDocuments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateDocuments.
     */
    distinct?: CandidateDocumentScalarFieldEnum | CandidateDocumentScalarFieldEnum[]
  }

  /**
   * CandidateDocument findMany
   */
  export type CandidateDocumentFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter, which CandidateDocuments to fetch.
     */
    where?: CandidateDocumentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateDocuments to fetch.
     */
    orderBy?: CandidateDocumentOrderByWithRelationInput | CandidateDocumentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CandidateDocuments.
     */
    cursor?: CandidateDocumentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateDocuments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateDocuments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateDocuments.
     */
    distinct?: CandidateDocumentScalarFieldEnum | CandidateDocumentScalarFieldEnum[]
  }

  /**
   * CandidateDocument create
   */
  export type CandidateDocumentCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * The data needed to create a CandidateDocument.
     */
    data: XOR<CandidateDocumentCreateInput, CandidateDocumentUncheckedCreateInput>
  }

  /**
   * CandidateDocument createMany
   */
  export type CandidateDocumentCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CandidateDocuments.
     */
    data: CandidateDocumentCreateManyInput | CandidateDocumentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CandidateDocument createManyAndReturn
   */
  export type CandidateDocumentCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * The data used to create many CandidateDocuments.
     */
    data: CandidateDocumentCreateManyInput | CandidateDocumentCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateDocument update
   */
  export type CandidateDocumentUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * The data needed to update a CandidateDocument.
     */
    data: XOR<CandidateDocumentUpdateInput, CandidateDocumentUncheckedUpdateInput>
    /**
     * Choose, which CandidateDocument to update.
     */
    where: CandidateDocumentWhereUniqueInput
  }

  /**
   * CandidateDocument updateMany
   */
  export type CandidateDocumentUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CandidateDocuments.
     */
    data: XOR<CandidateDocumentUpdateManyMutationInput, CandidateDocumentUncheckedUpdateManyInput>
    /**
     * Filter which CandidateDocuments to update
     */
    where?: CandidateDocumentWhereInput
    /**
     * Limit how many CandidateDocuments to update.
     */
    limit?: number
  }

  /**
   * CandidateDocument updateManyAndReturn
   */
  export type CandidateDocumentUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * The data used to update CandidateDocuments.
     */
    data: XOR<CandidateDocumentUpdateManyMutationInput, CandidateDocumentUncheckedUpdateManyInput>
    /**
     * Filter which CandidateDocuments to update
     */
    where?: CandidateDocumentWhereInput
    /**
     * Limit how many CandidateDocuments to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateDocument upsert
   */
  export type CandidateDocumentUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * The filter to search for the CandidateDocument to update in case it exists.
     */
    where: CandidateDocumentWhereUniqueInput
    /**
     * In case the CandidateDocument found by the `where` argument doesn't exist, create a new CandidateDocument with this data.
     */
    create: XOR<CandidateDocumentCreateInput, CandidateDocumentUncheckedCreateInput>
    /**
     * In case the CandidateDocument was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CandidateDocumentUpdateInput, CandidateDocumentUncheckedUpdateInput>
  }

  /**
   * CandidateDocument delete
   */
  export type CandidateDocumentDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    /**
     * Filter which CandidateDocument to delete.
     */
    where: CandidateDocumentWhereUniqueInput
  }

  /**
   * CandidateDocument deleteMany
   */
  export type CandidateDocumentDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateDocuments to delete
     */
    where?: CandidateDocumentWhereInput
    /**
     * Limit how many CandidateDocuments to delete.
     */
    limit?: number
  }

  /**
   * CandidateDocument.profileVersions
   */
  export type CandidateDocument$profileVersionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    where?: CandidateProfileVersionWhereInput
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    cursor?: CandidateProfileVersionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateDocument without action
   */
  export type CandidateDocumentDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
  }


  /**
   * Model CandidateProfile
   */

  export type AggregateCandidateProfile = {
    _count: CandidateProfileCountAggregateOutputType | null
    _min: CandidateProfileMinAggregateOutputType | null
    _max: CandidateProfileMaxAggregateOutputType | null
  }

  export type CandidateProfileMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    confirmedVersionId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CandidateProfileMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    confirmedVersionId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CandidateProfileCountAggregateOutputType = {
    id: number
    workspaceId: number
    confirmedVersionId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type CandidateProfileMinAggregateInputType = {
    id?: true
    workspaceId?: true
    confirmedVersionId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CandidateProfileMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    confirmedVersionId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CandidateProfileCountAggregateInputType = {
    id?: true
    workspaceId?: true
    confirmedVersionId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type CandidateProfileAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateProfile to aggregate.
     */
    where?: CandidateProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfiles to fetch.
     */
    orderBy?: CandidateProfileOrderByWithRelationInput | CandidateProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CandidateProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CandidateProfiles
    **/
    _count?: true | CandidateProfileCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CandidateProfileMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CandidateProfileMaxAggregateInputType
  }

  export type GetCandidateProfileAggregateType<T extends CandidateProfileAggregateArgs> = {
        [P in keyof T & keyof AggregateCandidateProfile]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCandidateProfile[P]>
      : GetScalarType<T[P], AggregateCandidateProfile[P]>
  }




  export type CandidateProfileGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateProfileWhereInput
    orderBy?: CandidateProfileOrderByWithAggregationInput | CandidateProfileOrderByWithAggregationInput[]
    by: CandidateProfileScalarFieldEnum[] | CandidateProfileScalarFieldEnum
    having?: CandidateProfileScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CandidateProfileCountAggregateInputType | true
    _min?: CandidateProfileMinAggregateInputType
    _max?: CandidateProfileMaxAggregateInputType
  }

  export type CandidateProfileGroupByOutputType = {
    id: string
    workspaceId: string
    confirmedVersionId: string | null
    createdAt: Date
    updatedAt: Date
    _count: CandidateProfileCountAggregateOutputType | null
    _min: CandidateProfileMinAggregateOutputType | null
    _max: CandidateProfileMaxAggregateOutputType | null
  }

  type GetCandidateProfileGroupByPayload<T extends CandidateProfileGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CandidateProfileGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CandidateProfileGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CandidateProfileGroupByOutputType[P]>
            : GetScalarType<T[P], CandidateProfileGroupByOutputType[P]>
        }
      >
    >


  export type CandidateProfileSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    confirmedVersionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
    versions?: boolean | CandidateProfile$versionsArgs<ExtArgs>
    _count?: boolean | CandidateProfileCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfile"]>

  export type CandidateProfileSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    confirmedVersionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfile"]>

  export type CandidateProfileSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    confirmedVersionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfile"]>

  export type CandidateProfileSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    confirmedVersionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type CandidateProfileOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "confirmedVersionId" | "createdAt" | "updatedAt", ExtArgs["result"]["candidateProfile"]>
  export type CandidateProfileInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
    versions?: boolean | CandidateProfile$versionsArgs<ExtArgs>
    _count?: boolean | CandidateProfileCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CandidateProfileIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
  }
  export type CandidateProfileIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    confirmedVersion?: boolean | CandidateProfile$confirmedVersionArgs<ExtArgs>
  }

  export type $CandidateProfilePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CandidateProfile"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      confirmedVersion: Prisma.$CandidateProfileVersionPayload<ExtArgs> | null
      versions: Prisma.$CandidateProfileVersionPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      /**
       * The version the candidate has confirmed. Null until they confirm one:
       * matching must never run on unreviewed extraction output.
       */
      confirmedVersionId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["candidateProfile"]>
    composites: {}
  }

  type CandidateProfileGetPayload<S extends boolean | null | undefined | CandidateProfileDefaultArgs> = $Result.GetResult<Prisma.$CandidateProfilePayload, S>

  type CandidateProfileCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CandidateProfileFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CandidateProfileCountAggregateInputType | true
    }

  export interface CandidateProfileDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CandidateProfile'], meta: { name: 'CandidateProfile' } }
    /**
     * Find zero or one CandidateProfile that matches the filter.
     * @param {CandidateProfileFindUniqueArgs} args - Arguments to find a CandidateProfile
     * @example
     * // Get one CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CandidateProfileFindUniqueArgs>(args: SelectSubset<T, CandidateProfileFindUniqueArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one CandidateProfile that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CandidateProfileFindUniqueOrThrowArgs} args - Arguments to find a CandidateProfile
     * @example
     * // Get one CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CandidateProfileFindUniqueOrThrowArgs>(args: SelectSubset<T, CandidateProfileFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateProfile that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileFindFirstArgs} args - Arguments to find a CandidateProfile
     * @example
     * // Get one CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CandidateProfileFindFirstArgs>(args?: SelectSubset<T, CandidateProfileFindFirstArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateProfile that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileFindFirstOrThrowArgs} args - Arguments to find a CandidateProfile
     * @example
     * // Get one CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CandidateProfileFindFirstOrThrowArgs>(args?: SelectSubset<T, CandidateProfileFindFirstOrThrowArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more CandidateProfiles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CandidateProfiles
     * const candidateProfiles = await prisma.candidateProfile.findMany()
     * 
     * // Get first 10 CandidateProfiles
     * const candidateProfiles = await prisma.candidateProfile.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const candidateProfileWithIdOnly = await prisma.candidateProfile.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CandidateProfileFindManyArgs>(args?: SelectSubset<T, CandidateProfileFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a CandidateProfile.
     * @param {CandidateProfileCreateArgs} args - Arguments to create a CandidateProfile.
     * @example
     * // Create one CandidateProfile
     * const CandidateProfile = await prisma.candidateProfile.create({
     *   data: {
     *     // ... data to create a CandidateProfile
     *   }
     * })
     * 
     */
    create<T extends CandidateProfileCreateArgs>(args: SelectSubset<T, CandidateProfileCreateArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many CandidateProfiles.
     * @param {CandidateProfileCreateManyArgs} args - Arguments to create many CandidateProfiles.
     * @example
     * // Create many CandidateProfiles
     * const candidateProfile = await prisma.candidateProfile.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CandidateProfileCreateManyArgs>(args?: SelectSubset<T, CandidateProfileCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CandidateProfiles and returns the data saved in the database.
     * @param {CandidateProfileCreateManyAndReturnArgs} args - Arguments to create many CandidateProfiles.
     * @example
     * // Create many CandidateProfiles
     * const candidateProfile = await prisma.candidateProfile.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CandidateProfiles and only return the `id`
     * const candidateProfileWithIdOnly = await prisma.candidateProfile.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CandidateProfileCreateManyAndReturnArgs>(args?: SelectSubset<T, CandidateProfileCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a CandidateProfile.
     * @param {CandidateProfileDeleteArgs} args - Arguments to delete one CandidateProfile.
     * @example
     * // Delete one CandidateProfile
     * const CandidateProfile = await prisma.candidateProfile.delete({
     *   where: {
     *     // ... filter to delete one CandidateProfile
     *   }
     * })
     * 
     */
    delete<T extends CandidateProfileDeleteArgs>(args: SelectSubset<T, CandidateProfileDeleteArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one CandidateProfile.
     * @param {CandidateProfileUpdateArgs} args - Arguments to update one CandidateProfile.
     * @example
     * // Update one CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CandidateProfileUpdateArgs>(args: SelectSubset<T, CandidateProfileUpdateArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more CandidateProfiles.
     * @param {CandidateProfileDeleteManyArgs} args - Arguments to filter CandidateProfiles to delete.
     * @example
     * // Delete a few CandidateProfiles
     * const { count } = await prisma.candidateProfile.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CandidateProfileDeleteManyArgs>(args?: SelectSubset<T, CandidateProfileDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateProfiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CandidateProfiles
     * const candidateProfile = await prisma.candidateProfile.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CandidateProfileUpdateManyArgs>(args: SelectSubset<T, CandidateProfileUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateProfiles and returns the data updated in the database.
     * @param {CandidateProfileUpdateManyAndReturnArgs} args - Arguments to update many CandidateProfiles.
     * @example
     * // Update many CandidateProfiles
     * const candidateProfile = await prisma.candidateProfile.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CandidateProfiles and only return the `id`
     * const candidateProfileWithIdOnly = await prisma.candidateProfile.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CandidateProfileUpdateManyAndReturnArgs>(args: SelectSubset<T, CandidateProfileUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one CandidateProfile.
     * @param {CandidateProfileUpsertArgs} args - Arguments to update or create a CandidateProfile.
     * @example
     * // Update or create a CandidateProfile
     * const candidateProfile = await prisma.candidateProfile.upsert({
     *   create: {
     *     // ... data to create a CandidateProfile
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CandidateProfile we want to update
     *   }
     * })
     */
    upsert<T extends CandidateProfileUpsertArgs>(args: SelectSubset<T, CandidateProfileUpsertArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of CandidateProfiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileCountArgs} args - Arguments to filter CandidateProfiles to count.
     * @example
     * // Count the number of CandidateProfiles
     * const count = await prisma.candidateProfile.count({
     *   where: {
     *     // ... the filter for the CandidateProfiles we want to count
     *   }
     * })
    **/
    count<T extends CandidateProfileCountArgs>(
      args?: Subset<T, CandidateProfileCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CandidateProfileCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CandidateProfile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CandidateProfileAggregateArgs>(args: Subset<T, CandidateProfileAggregateArgs>): Prisma.PrismaPromise<GetCandidateProfileAggregateType<T>>

    /**
     * Group by CandidateProfile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CandidateProfileGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CandidateProfileGroupByArgs['orderBy'] }
        : { orderBy?: CandidateProfileGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CandidateProfileGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCandidateProfileGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CandidateProfile model
   */
  readonly fields: CandidateProfileFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CandidateProfile.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CandidateProfileClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    confirmedVersion<T extends CandidateProfile$confirmedVersionArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfile$confirmedVersionArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    versions<T extends CandidateProfile$versionsArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfile$versionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CandidateProfile model
   */
  interface CandidateProfileFieldRefs {
    readonly id: FieldRef<"CandidateProfile", 'String'>
    readonly workspaceId: FieldRef<"CandidateProfile", 'String'>
    readonly confirmedVersionId: FieldRef<"CandidateProfile", 'String'>
    readonly createdAt: FieldRef<"CandidateProfile", 'DateTime'>
    readonly updatedAt: FieldRef<"CandidateProfile", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CandidateProfile findUnique
   */
  export type CandidateProfileFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfile to fetch.
     */
    where: CandidateProfileWhereUniqueInput
  }

  /**
   * CandidateProfile findUniqueOrThrow
   */
  export type CandidateProfileFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfile to fetch.
     */
    where: CandidateProfileWhereUniqueInput
  }

  /**
   * CandidateProfile findFirst
   */
  export type CandidateProfileFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfile to fetch.
     */
    where?: CandidateProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfiles to fetch.
     */
    orderBy?: CandidateProfileOrderByWithRelationInput | CandidateProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateProfiles.
     */
    cursor?: CandidateProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfiles.
     */
    distinct?: CandidateProfileScalarFieldEnum | CandidateProfileScalarFieldEnum[]
  }

  /**
   * CandidateProfile findFirstOrThrow
   */
  export type CandidateProfileFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfile to fetch.
     */
    where?: CandidateProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfiles to fetch.
     */
    orderBy?: CandidateProfileOrderByWithRelationInput | CandidateProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateProfiles.
     */
    cursor?: CandidateProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfiles.
     */
    distinct?: CandidateProfileScalarFieldEnum | CandidateProfileScalarFieldEnum[]
  }

  /**
   * CandidateProfile findMany
   */
  export type CandidateProfileFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfiles to fetch.
     */
    where?: CandidateProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfiles to fetch.
     */
    orderBy?: CandidateProfileOrderByWithRelationInput | CandidateProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CandidateProfiles.
     */
    cursor?: CandidateProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfiles.
     */
    distinct?: CandidateProfileScalarFieldEnum | CandidateProfileScalarFieldEnum[]
  }

  /**
   * CandidateProfile create
   */
  export type CandidateProfileCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * The data needed to create a CandidateProfile.
     */
    data: XOR<CandidateProfileCreateInput, CandidateProfileUncheckedCreateInput>
  }

  /**
   * CandidateProfile createMany
   */
  export type CandidateProfileCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CandidateProfiles.
     */
    data: CandidateProfileCreateManyInput | CandidateProfileCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CandidateProfile createManyAndReturn
   */
  export type CandidateProfileCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * The data used to create many CandidateProfiles.
     */
    data: CandidateProfileCreateManyInput | CandidateProfileCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateProfile update
   */
  export type CandidateProfileUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * The data needed to update a CandidateProfile.
     */
    data: XOR<CandidateProfileUpdateInput, CandidateProfileUncheckedUpdateInput>
    /**
     * Choose, which CandidateProfile to update.
     */
    where: CandidateProfileWhereUniqueInput
  }

  /**
   * CandidateProfile updateMany
   */
  export type CandidateProfileUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CandidateProfiles.
     */
    data: XOR<CandidateProfileUpdateManyMutationInput, CandidateProfileUncheckedUpdateManyInput>
    /**
     * Filter which CandidateProfiles to update
     */
    where?: CandidateProfileWhereInput
    /**
     * Limit how many CandidateProfiles to update.
     */
    limit?: number
  }

  /**
   * CandidateProfile updateManyAndReturn
   */
  export type CandidateProfileUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * The data used to update CandidateProfiles.
     */
    data: XOR<CandidateProfileUpdateManyMutationInput, CandidateProfileUncheckedUpdateManyInput>
    /**
     * Filter which CandidateProfiles to update
     */
    where?: CandidateProfileWhereInput
    /**
     * Limit how many CandidateProfiles to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateProfile upsert
   */
  export type CandidateProfileUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * The filter to search for the CandidateProfile to update in case it exists.
     */
    where: CandidateProfileWhereUniqueInput
    /**
     * In case the CandidateProfile found by the `where` argument doesn't exist, create a new CandidateProfile with this data.
     */
    create: XOR<CandidateProfileCreateInput, CandidateProfileUncheckedCreateInput>
    /**
     * In case the CandidateProfile was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CandidateProfileUpdateInput, CandidateProfileUncheckedUpdateInput>
  }

  /**
   * CandidateProfile delete
   */
  export type CandidateProfileDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    /**
     * Filter which CandidateProfile to delete.
     */
    where: CandidateProfileWhereUniqueInput
  }

  /**
   * CandidateProfile deleteMany
   */
  export type CandidateProfileDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateProfiles to delete
     */
    where?: CandidateProfileWhereInput
    /**
     * Limit how many CandidateProfiles to delete.
     */
    limit?: number
  }

  /**
   * CandidateProfile.confirmedVersion
   */
  export type CandidateProfile$confirmedVersionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    where?: CandidateProfileVersionWhereInput
  }

  /**
   * CandidateProfile.versions
   */
  export type CandidateProfile$versionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    where?: CandidateProfileVersionWhereInput
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    cursor?: CandidateProfileVersionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateProfile without action
   */
  export type CandidateProfileDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
  }


  /**
   * Model CandidateProfileVersion
   */

  export type AggregateCandidateProfileVersion = {
    _count: CandidateProfileVersionCountAggregateOutputType | null
    _avg: CandidateProfileVersionAvgAggregateOutputType | null
    _sum: CandidateProfileVersionSumAggregateOutputType | null
    _min: CandidateProfileVersionMinAggregateOutputType | null
    _max: CandidateProfileVersionMaxAggregateOutputType | null
  }

  export type CandidateProfileVersionAvgAggregateOutputType = {
    versionNumber: number | null
  }

  export type CandidateProfileVersionSumAggregateOutputType = {
    versionNumber: number | null
  }

  export type CandidateProfileVersionMinAggregateOutputType = {
    id: string | null
    profileId: string | null
    versionNumber: number | null
    origin: $Enums.ProfileVersionOrigin | null
    parentVersionId: string | null
    documentId: string | null
    sourceContentHash: string | null
    extractorName: string | null
    extractorVersion: string | null
    createdAt: Date | null
  }

  export type CandidateProfileVersionMaxAggregateOutputType = {
    id: string | null
    profileId: string | null
    versionNumber: number | null
    origin: $Enums.ProfileVersionOrigin | null
    parentVersionId: string | null
    documentId: string | null
    sourceContentHash: string | null
    extractorName: string | null
    extractorVersion: string | null
    createdAt: Date | null
  }

  export type CandidateProfileVersionCountAggregateOutputType = {
    id: number
    profileId: number
    versionNumber: number
    origin: number
    parentVersionId: number
    documentId: number
    sourceContentHash: number
    extractorName: number
    extractorVersion: number
    content: number
    confidence: number
    createdAt: number
    _all: number
  }


  export type CandidateProfileVersionAvgAggregateInputType = {
    versionNumber?: true
  }

  export type CandidateProfileVersionSumAggregateInputType = {
    versionNumber?: true
  }

  export type CandidateProfileVersionMinAggregateInputType = {
    id?: true
    profileId?: true
    versionNumber?: true
    origin?: true
    parentVersionId?: true
    documentId?: true
    sourceContentHash?: true
    extractorName?: true
    extractorVersion?: true
    createdAt?: true
  }

  export type CandidateProfileVersionMaxAggregateInputType = {
    id?: true
    profileId?: true
    versionNumber?: true
    origin?: true
    parentVersionId?: true
    documentId?: true
    sourceContentHash?: true
    extractorName?: true
    extractorVersion?: true
    createdAt?: true
  }

  export type CandidateProfileVersionCountAggregateInputType = {
    id?: true
    profileId?: true
    versionNumber?: true
    origin?: true
    parentVersionId?: true
    documentId?: true
    sourceContentHash?: true
    extractorName?: true
    extractorVersion?: true
    content?: true
    confidence?: true
    createdAt?: true
    _all?: true
  }

  export type CandidateProfileVersionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateProfileVersion to aggregate.
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfileVersions to fetch.
     */
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CandidateProfileVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfileVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfileVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CandidateProfileVersions
    **/
    _count?: true | CandidateProfileVersionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: CandidateProfileVersionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: CandidateProfileVersionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CandidateProfileVersionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CandidateProfileVersionMaxAggregateInputType
  }

  export type GetCandidateProfileVersionAggregateType<T extends CandidateProfileVersionAggregateArgs> = {
        [P in keyof T & keyof AggregateCandidateProfileVersion]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCandidateProfileVersion[P]>
      : GetScalarType<T[P], AggregateCandidateProfileVersion[P]>
  }




  export type CandidateProfileVersionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CandidateProfileVersionWhereInput
    orderBy?: CandidateProfileVersionOrderByWithAggregationInput | CandidateProfileVersionOrderByWithAggregationInput[]
    by: CandidateProfileVersionScalarFieldEnum[] | CandidateProfileVersionScalarFieldEnum
    having?: CandidateProfileVersionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CandidateProfileVersionCountAggregateInputType | true
    _avg?: CandidateProfileVersionAvgAggregateInputType
    _sum?: CandidateProfileVersionSumAggregateInputType
    _min?: CandidateProfileVersionMinAggregateInputType
    _max?: CandidateProfileVersionMaxAggregateInputType
  }

  export type CandidateProfileVersionGroupByOutputType = {
    id: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId: string | null
    documentId: string | null
    sourceContentHash: string | null
    extractorName: string
    extractorVersion: string
    content: JsonValue
    confidence: JsonValue | null
    createdAt: Date
    _count: CandidateProfileVersionCountAggregateOutputType | null
    _avg: CandidateProfileVersionAvgAggregateOutputType | null
    _sum: CandidateProfileVersionSumAggregateOutputType | null
    _min: CandidateProfileVersionMinAggregateOutputType | null
    _max: CandidateProfileVersionMaxAggregateOutputType | null
  }

  type GetCandidateProfileVersionGroupByPayload<T extends CandidateProfileVersionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CandidateProfileVersionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CandidateProfileVersionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CandidateProfileVersionGroupByOutputType[P]>
            : GetScalarType<T[P], CandidateProfileVersionGroupByOutputType[P]>
        }
      >
    >


  export type CandidateProfileVersionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    profileId?: boolean
    versionNumber?: boolean
    origin?: boolean
    parentVersionId?: boolean
    documentId?: boolean
    sourceContentHash?: boolean
    extractorName?: boolean
    extractorVersion?: boolean
    content?: boolean
    confidence?: boolean
    createdAt?: boolean
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    children?: boolean | CandidateProfileVersion$childrenArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
    confirmedFor?: boolean | CandidateProfileVersion$confirmedForArgs<ExtArgs>
    tailoredResumes?: boolean | CandidateProfileVersion$tailoredResumesArgs<ExtArgs>
    _count?: boolean | CandidateProfileVersionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfileVersion"]>

  export type CandidateProfileVersionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    profileId?: boolean
    versionNumber?: boolean
    origin?: boolean
    parentVersionId?: boolean
    documentId?: boolean
    sourceContentHash?: boolean
    extractorName?: boolean
    extractorVersion?: boolean
    content?: boolean
    confidence?: boolean
    createdAt?: boolean
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfileVersion"]>

  export type CandidateProfileVersionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    profileId?: boolean
    versionNumber?: boolean
    origin?: boolean
    parentVersionId?: boolean
    documentId?: boolean
    sourceContentHash?: boolean
    extractorName?: boolean
    extractorVersion?: boolean
    content?: boolean
    confidence?: boolean
    createdAt?: boolean
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
  }, ExtArgs["result"]["candidateProfileVersion"]>

  export type CandidateProfileVersionSelectScalar = {
    id?: boolean
    profileId?: boolean
    versionNumber?: boolean
    origin?: boolean
    parentVersionId?: boolean
    documentId?: boolean
    sourceContentHash?: boolean
    extractorName?: boolean
    extractorVersion?: boolean
    content?: boolean
    confidence?: boolean
    createdAt?: boolean
  }

  export type CandidateProfileVersionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "profileId" | "versionNumber" | "origin" | "parentVersionId" | "documentId" | "sourceContentHash" | "extractorName" | "extractorVersion" | "content" | "confidence" | "createdAt", ExtArgs["result"]["candidateProfileVersion"]>
  export type CandidateProfileVersionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    children?: boolean | CandidateProfileVersion$childrenArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
    confirmedFor?: boolean | CandidateProfileVersion$confirmedForArgs<ExtArgs>
    tailoredResumes?: boolean | CandidateProfileVersion$tailoredResumesArgs<ExtArgs>
    _count?: boolean | CandidateProfileVersionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CandidateProfileVersionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
  }
  export type CandidateProfileVersionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    profile?: boolean | CandidateProfileDefaultArgs<ExtArgs>
    parentVersion?: boolean | CandidateProfileVersion$parentVersionArgs<ExtArgs>
    document?: boolean | CandidateProfileVersion$documentArgs<ExtArgs>
  }

  export type $CandidateProfileVersionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CandidateProfileVersion"
    objects: {
      profile: Prisma.$CandidateProfilePayload<ExtArgs>
      parentVersion: Prisma.$CandidateProfileVersionPayload<ExtArgs> | null
      children: Prisma.$CandidateProfileVersionPayload<ExtArgs>[]
      document: Prisma.$CandidateDocumentPayload<ExtArgs> | null
      confirmedFor: Prisma.$CandidateProfilePayload<ExtArgs> | null
      tailoredResumes: Prisma.$TailoredResumePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      profileId: string
      /**
       * Monotonic per profile, so a version has a human-quotable reference
       * ("v3") as well as an id.
       */
      versionNumber: number
      origin: $Enums.ProfileVersionOrigin
      /**
       * The version this one corrects, if any. Null for the first version.
       */
      parentVersionId: string | null
      /**
       * The document this was extracted from. Null for MANUAL versions.
       */
      documentId: string | null
      /**
       * Copied from the document rather than joined, so the provenance survives
       * the document's deletion under a retention or erasure request.
       */
      sourceContentHash: string | null
      /**
       * Which code produced this content. A profile extracted by parser v1 and
       * one extracted by v2 are not comparable, and pretending otherwise is how
       * a matching regression becomes invisible.
       */
      extractorName: string
      extractorVersion: string
      /**
       * Schema-validated profile content (lib/profile/contract.ts). Stored as
       * JSON so the contract can gain fields without a migration per field,
       * and validated on read as well as on write.
       */
      content: Prisma.JsonValue
      /**
       * Per-field extraction confidence, same key shape as `content`. Drives
       * the "check this" markers in the review UI.
       */
      confidence: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["candidateProfileVersion"]>
    composites: {}
  }

  type CandidateProfileVersionGetPayload<S extends boolean | null | undefined | CandidateProfileVersionDefaultArgs> = $Result.GetResult<Prisma.$CandidateProfileVersionPayload, S>

  type CandidateProfileVersionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CandidateProfileVersionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CandidateProfileVersionCountAggregateInputType | true
    }

  export interface CandidateProfileVersionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CandidateProfileVersion'], meta: { name: 'CandidateProfileVersion' } }
    /**
     * Find zero or one CandidateProfileVersion that matches the filter.
     * @param {CandidateProfileVersionFindUniqueArgs} args - Arguments to find a CandidateProfileVersion
     * @example
     * // Get one CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CandidateProfileVersionFindUniqueArgs>(args: SelectSubset<T, CandidateProfileVersionFindUniqueArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one CandidateProfileVersion that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CandidateProfileVersionFindUniqueOrThrowArgs} args - Arguments to find a CandidateProfileVersion
     * @example
     * // Get one CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CandidateProfileVersionFindUniqueOrThrowArgs>(args: SelectSubset<T, CandidateProfileVersionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateProfileVersion that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionFindFirstArgs} args - Arguments to find a CandidateProfileVersion
     * @example
     * // Get one CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CandidateProfileVersionFindFirstArgs>(args?: SelectSubset<T, CandidateProfileVersionFindFirstArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first CandidateProfileVersion that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionFindFirstOrThrowArgs} args - Arguments to find a CandidateProfileVersion
     * @example
     * // Get one CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CandidateProfileVersionFindFirstOrThrowArgs>(args?: SelectSubset<T, CandidateProfileVersionFindFirstOrThrowArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more CandidateProfileVersions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CandidateProfileVersions
     * const candidateProfileVersions = await prisma.candidateProfileVersion.findMany()
     * 
     * // Get first 10 CandidateProfileVersions
     * const candidateProfileVersions = await prisma.candidateProfileVersion.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const candidateProfileVersionWithIdOnly = await prisma.candidateProfileVersion.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CandidateProfileVersionFindManyArgs>(args?: SelectSubset<T, CandidateProfileVersionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a CandidateProfileVersion.
     * @param {CandidateProfileVersionCreateArgs} args - Arguments to create a CandidateProfileVersion.
     * @example
     * // Create one CandidateProfileVersion
     * const CandidateProfileVersion = await prisma.candidateProfileVersion.create({
     *   data: {
     *     // ... data to create a CandidateProfileVersion
     *   }
     * })
     * 
     */
    create<T extends CandidateProfileVersionCreateArgs>(args: SelectSubset<T, CandidateProfileVersionCreateArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many CandidateProfileVersions.
     * @param {CandidateProfileVersionCreateManyArgs} args - Arguments to create many CandidateProfileVersions.
     * @example
     * // Create many CandidateProfileVersions
     * const candidateProfileVersion = await prisma.candidateProfileVersion.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CandidateProfileVersionCreateManyArgs>(args?: SelectSubset<T, CandidateProfileVersionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CandidateProfileVersions and returns the data saved in the database.
     * @param {CandidateProfileVersionCreateManyAndReturnArgs} args - Arguments to create many CandidateProfileVersions.
     * @example
     * // Create many CandidateProfileVersions
     * const candidateProfileVersion = await prisma.candidateProfileVersion.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CandidateProfileVersions and only return the `id`
     * const candidateProfileVersionWithIdOnly = await prisma.candidateProfileVersion.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CandidateProfileVersionCreateManyAndReturnArgs>(args?: SelectSubset<T, CandidateProfileVersionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a CandidateProfileVersion.
     * @param {CandidateProfileVersionDeleteArgs} args - Arguments to delete one CandidateProfileVersion.
     * @example
     * // Delete one CandidateProfileVersion
     * const CandidateProfileVersion = await prisma.candidateProfileVersion.delete({
     *   where: {
     *     // ... filter to delete one CandidateProfileVersion
     *   }
     * })
     * 
     */
    delete<T extends CandidateProfileVersionDeleteArgs>(args: SelectSubset<T, CandidateProfileVersionDeleteArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one CandidateProfileVersion.
     * @param {CandidateProfileVersionUpdateArgs} args - Arguments to update one CandidateProfileVersion.
     * @example
     * // Update one CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CandidateProfileVersionUpdateArgs>(args: SelectSubset<T, CandidateProfileVersionUpdateArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more CandidateProfileVersions.
     * @param {CandidateProfileVersionDeleteManyArgs} args - Arguments to filter CandidateProfileVersions to delete.
     * @example
     * // Delete a few CandidateProfileVersions
     * const { count } = await prisma.candidateProfileVersion.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CandidateProfileVersionDeleteManyArgs>(args?: SelectSubset<T, CandidateProfileVersionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateProfileVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CandidateProfileVersions
     * const candidateProfileVersion = await prisma.candidateProfileVersion.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CandidateProfileVersionUpdateManyArgs>(args: SelectSubset<T, CandidateProfileVersionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CandidateProfileVersions and returns the data updated in the database.
     * @param {CandidateProfileVersionUpdateManyAndReturnArgs} args - Arguments to update many CandidateProfileVersions.
     * @example
     * // Update many CandidateProfileVersions
     * const candidateProfileVersion = await prisma.candidateProfileVersion.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CandidateProfileVersions and only return the `id`
     * const candidateProfileVersionWithIdOnly = await prisma.candidateProfileVersion.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CandidateProfileVersionUpdateManyAndReturnArgs>(args: SelectSubset<T, CandidateProfileVersionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one CandidateProfileVersion.
     * @param {CandidateProfileVersionUpsertArgs} args - Arguments to update or create a CandidateProfileVersion.
     * @example
     * // Update or create a CandidateProfileVersion
     * const candidateProfileVersion = await prisma.candidateProfileVersion.upsert({
     *   create: {
     *     // ... data to create a CandidateProfileVersion
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CandidateProfileVersion we want to update
     *   }
     * })
     */
    upsert<T extends CandidateProfileVersionUpsertArgs>(args: SelectSubset<T, CandidateProfileVersionUpsertArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of CandidateProfileVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionCountArgs} args - Arguments to filter CandidateProfileVersions to count.
     * @example
     * // Count the number of CandidateProfileVersions
     * const count = await prisma.candidateProfileVersion.count({
     *   where: {
     *     // ... the filter for the CandidateProfileVersions we want to count
     *   }
     * })
    **/
    count<T extends CandidateProfileVersionCountArgs>(
      args?: Subset<T, CandidateProfileVersionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CandidateProfileVersionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CandidateProfileVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CandidateProfileVersionAggregateArgs>(args: Subset<T, CandidateProfileVersionAggregateArgs>): Prisma.PrismaPromise<GetCandidateProfileVersionAggregateType<T>>

    /**
     * Group by CandidateProfileVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CandidateProfileVersionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CandidateProfileVersionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CandidateProfileVersionGroupByArgs['orderBy'] }
        : { orderBy?: CandidateProfileVersionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CandidateProfileVersionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCandidateProfileVersionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CandidateProfileVersion model
   */
  readonly fields: CandidateProfileVersionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CandidateProfileVersion.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CandidateProfileVersionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    profile<T extends CandidateProfileDefaultArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileDefaultArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    parentVersion<T extends CandidateProfileVersion$parentVersionArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersion$parentVersionArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    children<T extends CandidateProfileVersion$childrenArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersion$childrenArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    document<T extends CandidateProfileVersion$documentArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersion$documentArgs<ExtArgs>>): Prisma__CandidateDocumentClient<$Result.GetResult<Prisma.$CandidateDocumentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    confirmedFor<T extends CandidateProfileVersion$confirmedForArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersion$confirmedForArgs<ExtArgs>>): Prisma__CandidateProfileClient<$Result.GetResult<Prisma.$CandidateProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    tailoredResumes<T extends CandidateProfileVersion$tailoredResumesArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersion$tailoredResumesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CandidateProfileVersion model
   */
  interface CandidateProfileVersionFieldRefs {
    readonly id: FieldRef<"CandidateProfileVersion", 'String'>
    readonly profileId: FieldRef<"CandidateProfileVersion", 'String'>
    readonly versionNumber: FieldRef<"CandidateProfileVersion", 'Int'>
    readonly origin: FieldRef<"CandidateProfileVersion", 'ProfileVersionOrigin'>
    readonly parentVersionId: FieldRef<"CandidateProfileVersion", 'String'>
    readonly documentId: FieldRef<"CandidateProfileVersion", 'String'>
    readonly sourceContentHash: FieldRef<"CandidateProfileVersion", 'String'>
    readonly extractorName: FieldRef<"CandidateProfileVersion", 'String'>
    readonly extractorVersion: FieldRef<"CandidateProfileVersion", 'String'>
    readonly content: FieldRef<"CandidateProfileVersion", 'Json'>
    readonly confidence: FieldRef<"CandidateProfileVersion", 'Json'>
    readonly createdAt: FieldRef<"CandidateProfileVersion", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CandidateProfileVersion findUnique
   */
  export type CandidateProfileVersionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfileVersion to fetch.
     */
    where: CandidateProfileVersionWhereUniqueInput
  }

  /**
   * CandidateProfileVersion findUniqueOrThrow
   */
  export type CandidateProfileVersionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfileVersion to fetch.
     */
    where: CandidateProfileVersionWhereUniqueInput
  }

  /**
   * CandidateProfileVersion findFirst
   */
  export type CandidateProfileVersionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfileVersion to fetch.
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfileVersions to fetch.
     */
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateProfileVersions.
     */
    cursor?: CandidateProfileVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfileVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfileVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfileVersions.
     */
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateProfileVersion findFirstOrThrow
   */
  export type CandidateProfileVersionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfileVersion to fetch.
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfileVersions to fetch.
     */
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CandidateProfileVersions.
     */
    cursor?: CandidateProfileVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfileVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfileVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfileVersions.
     */
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateProfileVersion findMany
   */
  export type CandidateProfileVersionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter, which CandidateProfileVersions to fetch.
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CandidateProfileVersions to fetch.
     */
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CandidateProfileVersions.
     */
    cursor?: CandidateProfileVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CandidateProfileVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CandidateProfileVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CandidateProfileVersions.
     */
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateProfileVersion create
   */
  export type CandidateProfileVersionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * The data needed to create a CandidateProfileVersion.
     */
    data: XOR<CandidateProfileVersionCreateInput, CandidateProfileVersionUncheckedCreateInput>
  }

  /**
   * CandidateProfileVersion createMany
   */
  export type CandidateProfileVersionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CandidateProfileVersions.
     */
    data: CandidateProfileVersionCreateManyInput | CandidateProfileVersionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CandidateProfileVersion createManyAndReturn
   */
  export type CandidateProfileVersionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * The data used to create many CandidateProfileVersions.
     */
    data: CandidateProfileVersionCreateManyInput | CandidateProfileVersionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateProfileVersion update
   */
  export type CandidateProfileVersionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * The data needed to update a CandidateProfileVersion.
     */
    data: XOR<CandidateProfileVersionUpdateInput, CandidateProfileVersionUncheckedUpdateInput>
    /**
     * Choose, which CandidateProfileVersion to update.
     */
    where: CandidateProfileVersionWhereUniqueInput
  }

  /**
   * CandidateProfileVersion updateMany
   */
  export type CandidateProfileVersionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CandidateProfileVersions.
     */
    data: XOR<CandidateProfileVersionUpdateManyMutationInput, CandidateProfileVersionUncheckedUpdateManyInput>
    /**
     * Filter which CandidateProfileVersions to update
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * Limit how many CandidateProfileVersions to update.
     */
    limit?: number
  }

  /**
   * CandidateProfileVersion updateManyAndReturn
   */
  export type CandidateProfileVersionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * The data used to update CandidateProfileVersions.
     */
    data: XOR<CandidateProfileVersionUpdateManyMutationInput, CandidateProfileVersionUncheckedUpdateManyInput>
    /**
     * Filter which CandidateProfileVersions to update
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * Limit how many CandidateProfileVersions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * CandidateProfileVersion upsert
   */
  export type CandidateProfileVersionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * The filter to search for the CandidateProfileVersion to update in case it exists.
     */
    where: CandidateProfileVersionWhereUniqueInput
    /**
     * In case the CandidateProfileVersion found by the `where` argument doesn't exist, create a new CandidateProfileVersion with this data.
     */
    create: XOR<CandidateProfileVersionCreateInput, CandidateProfileVersionUncheckedCreateInput>
    /**
     * In case the CandidateProfileVersion was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CandidateProfileVersionUpdateInput, CandidateProfileVersionUncheckedUpdateInput>
  }

  /**
   * CandidateProfileVersion delete
   */
  export type CandidateProfileVersionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    /**
     * Filter which CandidateProfileVersion to delete.
     */
    where: CandidateProfileVersionWhereUniqueInput
  }

  /**
   * CandidateProfileVersion deleteMany
   */
  export type CandidateProfileVersionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CandidateProfileVersions to delete
     */
    where?: CandidateProfileVersionWhereInput
    /**
     * Limit how many CandidateProfileVersions to delete.
     */
    limit?: number
  }

  /**
   * CandidateProfileVersion.parentVersion
   */
  export type CandidateProfileVersion$parentVersionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    where?: CandidateProfileVersionWhereInput
  }

  /**
   * CandidateProfileVersion.children
   */
  export type CandidateProfileVersion$childrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
    where?: CandidateProfileVersionWhereInput
    orderBy?: CandidateProfileVersionOrderByWithRelationInput | CandidateProfileVersionOrderByWithRelationInput[]
    cursor?: CandidateProfileVersionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CandidateProfileVersionScalarFieldEnum | CandidateProfileVersionScalarFieldEnum[]
  }

  /**
   * CandidateProfileVersion.document
   */
  export type CandidateProfileVersion$documentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateDocument
     */
    select?: CandidateDocumentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateDocument
     */
    omit?: CandidateDocumentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateDocumentInclude<ExtArgs> | null
    where?: CandidateDocumentWhereInput
  }

  /**
   * CandidateProfileVersion.confirmedFor
   */
  export type CandidateProfileVersion$confirmedForArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfile
     */
    select?: CandidateProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfile
     */
    omit?: CandidateProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileInclude<ExtArgs> | null
    where?: CandidateProfileWhereInput
  }

  /**
   * CandidateProfileVersion.tailoredResumes
   */
  export type CandidateProfileVersion$tailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    where?: TailoredResumeWhereInput
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    cursor?: TailoredResumeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * CandidateProfileVersion without action
   */
  export type CandidateProfileVersionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CandidateProfileVersion
     */
    select?: CandidateProfileVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CandidateProfileVersion
     */
    omit?: CandidateProfileVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CandidateProfileVersionInclude<ExtArgs> | null
  }


  /**
   * Model TargetJob
   */

  export type AggregateTargetJob = {
    _count: TargetJobCountAggregateOutputType | null
    _min: TargetJobMinAggregateOutputType | null
    _max: TargetJobMaxAggregateOutputType | null
  }

  export type TargetJobMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    sourceUrl: string | null
    rawText: string | null
    title: string | null
    employer: string | null
    status: $Enums.TargetJobStatus | null
    fetchedAt: Date | null
    createdAt: Date | null
  }

  export type TargetJobMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    sourceUrl: string | null
    rawText: string | null
    title: string | null
    employer: string | null
    status: $Enums.TargetJobStatus | null
    fetchedAt: Date | null
    createdAt: Date | null
  }

  export type TargetJobCountAggregateOutputType = {
    id: number
    workspaceId: number
    sourceUrl: number
    rawText: number
    title: number
    employer: number
    status: number
    fetchedAt: number
    createdAt: number
    _all: number
  }


  export type TargetJobMinAggregateInputType = {
    id?: true
    workspaceId?: true
    sourceUrl?: true
    rawText?: true
    title?: true
    employer?: true
    status?: true
    fetchedAt?: true
    createdAt?: true
  }

  export type TargetJobMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    sourceUrl?: true
    rawText?: true
    title?: true
    employer?: true
    status?: true
    fetchedAt?: true
    createdAt?: true
  }

  export type TargetJobCountAggregateInputType = {
    id?: true
    workspaceId?: true
    sourceUrl?: true
    rawText?: true
    title?: true
    employer?: true
    status?: true
    fetchedAt?: true
    createdAt?: true
    _all?: true
  }

  export type TargetJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TargetJob to aggregate.
     */
    where?: TargetJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TargetJobs to fetch.
     */
    orderBy?: TargetJobOrderByWithRelationInput | TargetJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TargetJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TargetJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TargetJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TargetJobs
    **/
    _count?: true | TargetJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TargetJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TargetJobMaxAggregateInputType
  }

  export type GetTargetJobAggregateType<T extends TargetJobAggregateArgs> = {
        [P in keyof T & keyof AggregateTargetJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTargetJob[P]>
      : GetScalarType<T[P], AggregateTargetJob[P]>
  }




  export type TargetJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TargetJobWhereInput
    orderBy?: TargetJobOrderByWithAggregationInput | TargetJobOrderByWithAggregationInput[]
    by: TargetJobScalarFieldEnum[] | TargetJobScalarFieldEnum
    having?: TargetJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TargetJobCountAggregateInputType | true
    _min?: TargetJobMinAggregateInputType
    _max?: TargetJobMaxAggregateInputType
  }

  export type TargetJobGroupByOutputType = {
    id: string
    workspaceId: string
    sourceUrl: string
    rawText: string | null
    title: string | null
    employer: string | null
    status: $Enums.TargetJobStatus
    fetchedAt: Date
    createdAt: Date
    _count: TargetJobCountAggregateOutputType | null
    _min: TargetJobMinAggregateOutputType | null
    _max: TargetJobMaxAggregateOutputType | null
  }

  type GetTargetJobGroupByPayload<T extends TargetJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TargetJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TargetJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TargetJobGroupByOutputType[P]>
            : GetScalarType<T[P], TargetJobGroupByOutputType[P]>
        }
      >
    >


  export type TargetJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    sourceUrl?: boolean
    rawText?: boolean
    title?: boolean
    employer?: boolean
    status?: boolean
    fetchedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    tailoredResumes?: boolean | TargetJob$tailoredResumesArgs<ExtArgs>
    _count?: boolean | TargetJobCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["targetJob"]>

  export type TargetJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    sourceUrl?: boolean
    rawText?: boolean
    title?: boolean
    employer?: boolean
    status?: boolean
    fetchedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["targetJob"]>

  export type TargetJobSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    sourceUrl?: boolean
    rawText?: boolean
    title?: boolean
    employer?: boolean
    status?: boolean
    fetchedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["targetJob"]>

  export type TargetJobSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    sourceUrl?: boolean
    rawText?: boolean
    title?: boolean
    employer?: boolean
    status?: boolean
    fetchedAt?: boolean
    createdAt?: boolean
  }

  export type TargetJobOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "sourceUrl" | "rawText" | "title" | "employer" | "status" | "fetchedAt" | "createdAt", ExtArgs["result"]["targetJob"]>
  export type TargetJobInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    tailoredResumes?: boolean | TargetJob$tailoredResumesArgs<ExtArgs>
    _count?: boolean | TargetJobCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type TargetJobIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }
  export type TargetJobIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }

  export type $TargetJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TargetJob"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      tailoredResumes: Prisma.$TailoredResumePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      /**
       * The URL the candidate pasted. Validated as public HTTPS before fetch —
       * see lib/tailoring/fetchJob.ts's isPublicHttpsUrl.
       */
      sourceUrl: string
      /**
       * Readable text extracted from the page, redacted the same way CV text
       * is before it ever reaches a prompt. Null when the fetch failed.
       */
      rawText: string | null
      /**
       * Best-effort title/employer read from the page, shown to the candidate
       * to confirm before an AI call is spent. Both null when extraction
       * could not identify them, or when the fetch failed outright.
       */
      title: string | null
      employer: string | null
      status: $Enums.TargetJobStatus
      fetchedAt: Date
      createdAt: Date
    }, ExtArgs["result"]["targetJob"]>
    composites: {}
  }

  type TargetJobGetPayload<S extends boolean | null | undefined | TargetJobDefaultArgs> = $Result.GetResult<Prisma.$TargetJobPayload, S>

  type TargetJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TargetJobFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TargetJobCountAggregateInputType | true
    }

  export interface TargetJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TargetJob'], meta: { name: 'TargetJob' } }
    /**
     * Find zero or one TargetJob that matches the filter.
     * @param {TargetJobFindUniqueArgs} args - Arguments to find a TargetJob
     * @example
     * // Get one TargetJob
     * const targetJob = await prisma.targetJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TargetJobFindUniqueArgs>(args: SelectSubset<T, TargetJobFindUniqueArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TargetJob that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TargetJobFindUniqueOrThrowArgs} args - Arguments to find a TargetJob
     * @example
     * // Get one TargetJob
     * const targetJob = await prisma.targetJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TargetJobFindUniqueOrThrowArgs>(args: SelectSubset<T, TargetJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TargetJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobFindFirstArgs} args - Arguments to find a TargetJob
     * @example
     * // Get one TargetJob
     * const targetJob = await prisma.targetJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TargetJobFindFirstArgs>(args?: SelectSubset<T, TargetJobFindFirstArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TargetJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobFindFirstOrThrowArgs} args - Arguments to find a TargetJob
     * @example
     * // Get one TargetJob
     * const targetJob = await prisma.targetJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TargetJobFindFirstOrThrowArgs>(args?: SelectSubset<T, TargetJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TargetJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TargetJobs
     * const targetJobs = await prisma.targetJob.findMany()
     * 
     * // Get first 10 TargetJobs
     * const targetJobs = await prisma.targetJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const targetJobWithIdOnly = await prisma.targetJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TargetJobFindManyArgs>(args?: SelectSubset<T, TargetJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TargetJob.
     * @param {TargetJobCreateArgs} args - Arguments to create a TargetJob.
     * @example
     * // Create one TargetJob
     * const TargetJob = await prisma.targetJob.create({
     *   data: {
     *     // ... data to create a TargetJob
     *   }
     * })
     * 
     */
    create<T extends TargetJobCreateArgs>(args: SelectSubset<T, TargetJobCreateArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TargetJobs.
     * @param {TargetJobCreateManyArgs} args - Arguments to create many TargetJobs.
     * @example
     * // Create many TargetJobs
     * const targetJob = await prisma.targetJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TargetJobCreateManyArgs>(args?: SelectSubset<T, TargetJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TargetJobs and returns the data saved in the database.
     * @param {TargetJobCreateManyAndReturnArgs} args - Arguments to create many TargetJobs.
     * @example
     * // Create many TargetJobs
     * const targetJob = await prisma.targetJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TargetJobs and only return the `id`
     * const targetJobWithIdOnly = await prisma.targetJob.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TargetJobCreateManyAndReturnArgs>(args?: SelectSubset<T, TargetJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TargetJob.
     * @param {TargetJobDeleteArgs} args - Arguments to delete one TargetJob.
     * @example
     * // Delete one TargetJob
     * const TargetJob = await prisma.targetJob.delete({
     *   where: {
     *     // ... filter to delete one TargetJob
     *   }
     * })
     * 
     */
    delete<T extends TargetJobDeleteArgs>(args: SelectSubset<T, TargetJobDeleteArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TargetJob.
     * @param {TargetJobUpdateArgs} args - Arguments to update one TargetJob.
     * @example
     * // Update one TargetJob
     * const targetJob = await prisma.targetJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TargetJobUpdateArgs>(args: SelectSubset<T, TargetJobUpdateArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TargetJobs.
     * @param {TargetJobDeleteManyArgs} args - Arguments to filter TargetJobs to delete.
     * @example
     * // Delete a few TargetJobs
     * const { count } = await prisma.targetJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TargetJobDeleteManyArgs>(args?: SelectSubset<T, TargetJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TargetJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TargetJobs
     * const targetJob = await prisma.targetJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TargetJobUpdateManyArgs>(args: SelectSubset<T, TargetJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TargetJobs and returns the data updated in the database.
     * @param {TargetJobUpdateManyAndReturnArgs} args - Arguments to update many TargetJobs.
     * @example
     * // Update many TargetJobs
     * const targetJob = await prisma.targetJob.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TargetJobs and only return the `id`
     * const targetJobWithIdOnly = await prisma.targetJob.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TargetJobUpdateManyAndReturnArgs>(args: SelectSubset<T, TargetJobUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TargetJob.
     * @param {TargetJobUpsertArgs} args - Arguments to update or create a TargetJob.
     * @example
     * // Update or create a TargetJob
     * const targetJob = await prisma.targetJob.upsert({
     *   create: {
     *     // ... data to create a TargetJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TargetJob we want to update
     *   }
     * })
     */
    upsert<T extends TargetJobUpsertArgs>(args: SelectSubset<T, TargetJobUpsertArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TargetJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobCountArgs} args - Arguments to filter TargetJobs to count.
     * @example
     * // Count the number of TargetJobs
     * const count = await prisma.targetJob.count({
     *   where: {
     *     // ... the filter for the TargetJobs we want to count
     *   }
     * })
    **/
    count<T extends TargetJobCountArgs>(
      args?: Subset<T, TargetJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TargetJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TargetJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TargetJobAggregateArgs>(args: Subset<T, TargetJobAggregateArgs>): Prisma.PrismaPromise<GetTargetJobAggregateType<T>>

    /**
     * Group by TargetJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TargetJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TargetJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TargetJobGroupByArgs['orderBy'] }
        : { orderBy?: TargetJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TargetJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTargetJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TargetJob model
   */
  readonly fields: TargetJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TargetJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TargetJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    tailoredResumes<T extends TargetJob$tailoredResumesArgs<ExtArgs> = {}>(args?: Subset<T, TargetJob$tailoredResumesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TargetJob model
   */
  interface TargetJobFieldRefs {
    readonly id: FieldRef<"TargetJob", 'String'>
    readonly workspaceId: FieldRef<"TargetJob", 'String'>
    readonly sourceUrl: FieldRef<"TargetJob", 'String'>
    readonly rawText: FieldRef<"TargetJob", 'String'>
    readonly title: FieldRef<"TargetJob", 'String'>
    readonly employer: FieldRef<"TargetJob", 'String'>
    readonly status: FieldRef<"TargetJob", 'TargetJobStatus'>
    readonly fetchedAt: FieldRef<"TargetJob", 'DateTime'>
    readonly createdAt: FieldRef<"TargetJob", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TargetJob findUnique
   */
  export type TargetJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter, which TargetJob to fetch.
     */
    where: TargetJobWhereUniqueInput
  }

  /**
   * TargetJob findUniqueOrThrow
   */
  export type TargetJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter, which TargetJob to fetch.
     */
    where: TargetJobWhereUniqueInput
  }

  /**
   * TargetJob findFirst
   */
  export type TargetJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter, which TargetJob to fetch.
     */
    where?: TargetJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TargetJobs to fetch.
     */
    orderBy?: TargetJobOrderByWithRelationInput | TargetJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TargetJobs.
     */
    cursor?: TargetJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TargetJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TargetJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TargetJobs.
     */
    distinct?: TargetJobScalarFieldEnum | TargetJobScalarFieldEnum[]
  }

  /**
   * TargetJob findFirstOrThrow
   */
  export type TargetJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter, which TargetJob to fetch.
     */
    where?: TargetJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TargetJobs to fetch.
     */
    orderBy?: TargetJobOrderByWithRelationInput | TargetJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TargetJobs.
     */
    cursor?: TargetJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TargetJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TargetJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TargetJobs.
     */
    distinct?: TargetJobScalarFieldEnum | TargetJobScalarFieldEnum[]
  }

  /**
   * TargetJob findMany
   */
  export type TargetJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter, which TargetJobs to fetch.
     */
    where?: TargetJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TargetJobs to fetch.
     */
    orderBy?: TargetJobOrderByWithRelationInput | TargetJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TargetJobs.
     */
    cursor?: TargetJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TargetJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TargetJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TargetJobs.
     */
    distinct?: TargetJobScalarFieldEnum | TargetJobScalarFieldEnum[]
  }

  /**
   * TargetJob create
   */
  export type TargetJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * The data needed to create a TargetJob.
     */
    data: XOR<TargetJobCreateInput, TargetJobUncheckedCreateInput>
  }

  /**
   * TargetJob createMany
   */
  export type TargetJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TargetJobs.
     */
    data: TargetJobCreateManyInput | TargetJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TargetJob createManyAndReturn
   */
  export type TargetJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * The data used to create many TargetJobs.
     */
    data: TargetJobCreateManyInput | TargetJobCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * TargetJob update
   */
  export type TargetJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * The data needed to update a TargetJob.
     */
    data: XOR<TargetJobUpdateInput, TargetJobUncheckedUpdateInput>
    /**
     * Choose, which TargetJob to update.
     */
    where: TargetJobWhereUniqueInput
  }

  /**
   * TargetJob updateMany
   */
  export type TargetJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TargetJobs.
     */
    data: XOR<TargetJobUpdateManyMutationInput, TargetJobUncheckedUpdateManyInput>
    /**
     * Filter which TargetJobs to update
     */
    where?: TargetJobWhereInput
    /**
     * Limit how many TargetJobs to update.
     */
    limit?: number
  }

  /**
   * TargetJob updateManyAndReturn
   */
  export type TargetJobUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * The data used to update TargetJobs.
     */
    data: XOR<TargetJobUpdateManyMutationInput, TargetJobUncheckedUpdateManyInput>
    /**
     * Filter which TargetJobs to update
     */
    where?: TargetJobWhereInput
    /**
     * Limit how many TargetJobs to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * TargetJob upsert
   */
  export type TargetJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * The filter to search for the TargetJob to update in case it exists.
     */
    where: TargetJobWhereUniqueInput
    /**
     * In case the TargetJob found by the `where` argument doesn't exist, create a new TargetJob with this data.
     */
    create: XOR<TargetJobCreateInput, TargetJobUncheckedCreateInput>
    /**
     * In case the TargetJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TargetJobUpdateInput, TargetJobUncheckedUpdateInput>
  }

  /**
   * TargetJob delete
   */
  export type TargetJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
    /**
     * Filter which TargetJob to delete.
     */
    where: TargetJobWhereUniqueInput
  }

  /**
   * TargetJob deleteMany
   */
  export type TargetJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TargetJobs to delete
     */
    where?: TargetJobWhereInput
    /**
     * Limit how many TargetJobs to delete.
     */
    limit?: number
  }

  /**
   * TargetJob.tailoredResumes
   */
  export type TargetJob$tailoredResumesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    where?: TailoredResumeWhereInput
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    cursor?: TailoredResumeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * TargetJob without action
   */
  export type TargetJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TargetJob
     */
    select?: TargetJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TargetJob
     */
    omit?: TargetJobOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TargetJobInclude<ExtArgs> | null
  }


  /**
   * Model TailoredResume
   */

  export type AggregateTailoredResume = {
    _count: TailoredResumeCountAggregateOutputType | null
    _min: TailoredResumeMinAggregateOutputType | null
    _max: TailoredResumeMaxAggregateOutputType | null
  }

  export type TailoredResumeMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    profileVersionId: string | null
    targetJobId: string | null
    templateKey: string | null
    aiJobId: string | null
    promptVersion: string | null
    modelVersion: string | null
    degraded: boolean | null
    createdAt: Date | null
  }

  export type TailoredResumeMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    profileVersionId: string | null
    targetJobId: string | null
    templateKey: string | null
    aiJobId: string | null
    promptVersion: string | null
    modelVersion: string | null
    degraded: boolean | null
    createdAt: Date | null
  }

  export type TailoredResumeCountAggregateOutputType = {
    id: number
    workspaceId: number
    profileVersionId: number
    targetJobId: number
    content: number
    templateKey: number
    aiJobId: number
    promptVersion: number
    modelVersion: number
    degraded: number
    createdAt: number
    _all: number
  }


  export type TailoredResumeMinAggregateInputType = {
    id?: true
    workspaceId?: true
    profileVersionId?: true
    targetJobId?: true
    templateKey?: true
    aiJobId?: true
    promptVersion?: true
    modelVersion?: true
    degraded?: true
    createdAt?: true
  }

  export type TailoredResumeMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    profileVersionId?: true
    targetJobId?: true
    templateKey?: true
    aiJobId?: true
    promptVersion?: true
    modelVersion?: true
    degraded?: true
    createdAt?: true
  }

  export type TailoredResumeCountAggregateInputType = {
    id?: true
    workspaceId?: true
    profileVersionId?: true
    targetJobId?: true
    content?: true
    templateKey?: true
    aiJobId?: true
    promptVersion?: true
    modelVersion?: true
    degraded?: true
    createdAt?: true
    _all?: true
  }

  export type TailoredResumeAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TailoredResume to aggregate.
     */
    where?: TailoredResumeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TailoredResumes to fetch.
     */
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TailoredResumeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TailoredResumes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TailoredResumes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TailoredResumes
    **/
    _count?: true | TailoredResumeCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TailoredResumeMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TailoredResumeMaxAggregateInputType
  }

  export type GetTailoredResumeAggregateType<T extends TailoredResumeAggregateArgs> = {
        [P in keyof T & keyof AggregateTailoredResume]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTailoredResume[P]>
      : GetScalarType<T[P], AggregateTailoredResume[P]>
  }




  export type TailoredResumeGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TailoredResumeWhereInput
    orderBy?: TailoredResumeOrderByWithAggregationInput | TailoredResumeOrderByWithAggregationInput[]
    by: TailoredResumeScalarFieldEnum[] | TailoredResumeScalarFieldEnum
    having?: TailoredResumeScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TailoredResumeCountAggregateInputType | true
    _min?: TailoredResumeMinAggregateInputType
    _max?: TailoredResumeMaxAggregateInputType
  }

  export type TailoredResumeGroupByOutputType = {
    id: string
    workspaceId: string
    profileVersionId: string
    targetJobId: string
    content: JsonValue
    templateKey: string
    aiJobId: string | null
    promptVersion: string
    modelVersion: string
    degraded: boolean
    createdAt: Date
    _count: TailoredResumeCountAggregateOutputType | null
    _min: TailoredResumeMinAggregateOutputType | null
    _max: TailoredResumeMaxAggregateOutputType | null
  }

  type GetTailoredResumeGroupByPayload<T extends TailoredResumeGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TailoredResumeGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TailoredResumeGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TailoredResumeGroupByOutputType[P]>
            : GetScalarType<T[P], TailoredResumeGroupByOutputType[P]>
        }
      >
    >


  export type TailoredResumeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    profileVersionId?: boolean
    targetJobId?: boolean
    content?: boolean
    templateKey?: boolean
    aiJobId?: boolean
    promptVersion?: boolean
    modelVersion?: boolean
    degraded?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tailoredResume"]>

  export type TailoredResumeSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    profileVersionId?: boolean
    targetJobId?: boolean
    content?: boolean
    templateKey?: boolean
    aiJobId?: boolean
    promptVersion?: boolean
    modelVersion?: boolean
    degraded?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tailoredResume"]>

  export type TailoredResumeSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    profileVersionId?: boolean
    targetJobId?: boolean
    content?: boolean
    templateKey?: boolean
    aiJobId?: boolean
    promptVersion?: boolean
    modelVersion?: boolean
    degraded?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tailoredResume"]>

  export type TailoredResumeSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    profileVersionId?: boolean
    targetJobId?: boolean
    content?: boolean
    templateKey?: boolean
    aiJobId?: boolean
    promptVersion?: boolean
    modelVersion?: boolean
    degraded?: boolean
    createdAt?: boolean
  }

  export type TailoredResumeOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "profileVersionId" | "targetJobId" | "content" | "templateKey" | "aiJobId" | "promptVersion" | "modelVersion" | "degraded" | "createdAt", ExtArgs["result"]["tailoredResume"]>
  export type TailoredResumeInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }
  export type TailoredResumeIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }
  export type TailoredResumeIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    profileVersion?: boolean | CandidateProfileVersionDefaultArgs<ExtArgs>
    targetJob?: boolean | TargetJobDefaultArgs<ExtArgs>
  }

  export type $TailoredResumePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TailoredResume"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      profileVersion: Prisma.$CandidateProfileVersionPayload<ExtArgs>
      targetJob: Prisma.$TargetJobPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      profileVersionId: string
      targetJobId: string
      /**
       * Schema-validated tailored content (lib/tailoring/ai/schema.ts's
       * tailoredResumeSchema). Employer/dates/degrees are carried over
       * verbatim from the source profile — never AI-generated — only wording
       * and ordering are rewritten.
       */
      content: Prisma.JsonValue
      /**
       * Which visual layout to render this with (components/tailoring/templates).
       * Only one key exists today; kept as a field so a second template is an
       * additive change, not a schema migration.
       */
      templateKey: string
      aiJobId: string | null
      promptVersion: string
      modelVersion: string
      /**
       * True when this was produced by the degraded fallback (no provider /
       * retries exhausted / budget out) rather than a real model call.
       */
      degraded: boolean
      createdAt: Date
    }, ExtArgs["result"]["tailoredResume"]>
    composites: {}
  }

  type TailoredResumeGetPayload<S extends boolean | null | undefined | TailoredResumeDefaultArgs> = $Result.GetResult<Prisma.$TailoredResumePayload, S>

  type TailoredResumeCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TailoredResumeFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TailoredResumeCountAggregateInputType | true
    }

  export interface TailoredResumeDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TailoredResume'], meta: { name: 'TailoredResume' } }
    /**
     * Find zero or one TailoredResume that matches the filter.
     * @param {TailoredResumeFindUniqueArgs} args - Arguments to find a TailoredResume
     * @example
     * // Get one TailoredResume
     * const tailoredResume = await prisma.tailoredResume.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TailoredResumeFindUniqueArgs>(args: SelectSubset<T, TailoredResumeFindUniqueArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TailoredResume that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TailoredResumeFindUniqueOrThrowArgs} args - Arguments to find a TailoredResume
     * @example
     * // Get one TailoredResume
     * const tailoredResume = await prisma.tailoredResume.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TailoredResumeFindUniqueOrThrowArgs>(args: SelectSubset<T, TailoredResumeFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TailoredResume that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeFindFirstArgs} args - Arguments to find a TailoredResume
     * @example
     * // Get one TailoredResume
     * const tailoredResume = await prisma.tailoredResume.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TailoredResumeFindFirstArgs>(args?: SelectSubset<T, TailoredResumeFindFirstArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TailoredResume that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeFindFirstOrThrowArgs} args - Arguments to find a TailoredResume
     * @example
     * // Get one TailoredResume
     * const tailoredResume = await prisma.tailoredResume.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TailoredResumeFindFirstOrThrowArgs>(args?: SelectSubset<T, TailoredResumeFindFirstOrThrowArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TailoredResumes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TailoredResumes
     * const tailoredResumes = await prisma.tailoredResume.findMany()
     * 
     * // Get first 10 TailoredResumes
     * const tailoredResumes = await prisma.tailoredResume.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tailoredResumeWithIdOnly = await prisma.tailoredResume.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TailoredResumeFindManyArgs>(args?: SelectSubset<T, TailoredResumeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TailoredResume.
     * @param {TailoredResumeCreateArgs} args - Arguments to create a TailoredResume.
     * @example
     * // Create one TailoredResume
     * const TailoredResume = await prisma.tailoredResume.create({
     *   data: {
     *     // ... data to create a TailoredResume
     *   }
     * })
     * 
     */
    create<T extends TailoredResumeCreateArgs>(args: SelectSubset<T, TailoredResumeCreateArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TailoredResumes.
     * @param {TailoredResumeCreateManyArgs} args - Arguments to create many TailoredResumes.
     * @example
     * // Create many TailoredResumes
     * const tailoredResume = await prisma.tailoredResume.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TailoredResumeCreateManyArgs>(args?: SelectSubset<T, TailoredResumeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TailoredResumes and returns the data saved in the database.
     * @param {TailoredResumeCreateManyAndReturnArgs} args - Arguments to create many TailoredResumes.
     * @example
     * // Create many TailoredResumes
     * const tailoredResume = await prisma.tailoredResume.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TailoredResumes and only return the `id`
     * const tailoredResumeWithIdOnly = await prisma.tailoredResume.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TailoredResumeCreateManyAndReturnArgs>(args?: SelectSubset<T, TailoredResumeCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TailoredResume.
     * @param {TailoredResumeDeleteArgs} args - Arguments to delete one TailoredResume.
     * @example
     * // Delete one TailoredResume
     * const TailoredResume = await prisma.tailoredResume.delete({
     *   where: {
     *     // ... filter to delete one TailoredResume
     *   }
     * })
     * 
     */
    delete<T extends TailoredResumeDeleteArgs>(args: SelectSubset<T, TailoredResumeDeleteArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TailoredResume.
     * @param {TailoredResumeUpdateArgs} args - Arguments to update one TailoredResume.
     * @example
     * // Update one TailoredResume
     * const tailoredResume = await prisma.tailoredResume.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TailoredResumeUpdateArgs>(args: SelectSubset<T, TailoredResumeUpdateArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TailoredResumes.
     * @param {TailoredResumeDeleteManyArgs} args - Arguments to filter TailoredResumes to delete.
     * @example
     * // Delete a few TailoredResumes
     * const { count } = await prisma.tailoredResume.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TailoredResumeDeleteManyArgs>(args?: SelectSubset<T, TailoredResumeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TailoredResumes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TailoredResumes
     * const tailoredResume = await prisma.tailoredResume.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TailoredResumeUpdateManyArgs>(args: SelectSubset<T, TailoredResumeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TailoredResumes and returns the data updated in the database.
     * @param {TailoredResumeUpdateManyAndReturnArgs} args - Arguments to update many TailoredResumes.
     * @example
     * // Update many TailoredResumes
     * const tailoredResume = await prisma.tailoredResume.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TailoredResumes and only return the `id`
     * const tailoredResumeWithIdOnly = await prisma.tailoredResume.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TailoredResumeUpdateManyAndReturnArgs>(args: SelectSubset<T, TailoredResumeUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TailoredResume.
     * @param {TailoredResumeUpsertArgs} args - Arguments to update or create a TailoredResume.
     * @example
     * // Update or create a TailoredResume
     * const tailoredResume = await prisma.tailoredResume.upsert({
     *   create: {
     *     // ... data to create a TailoredResume
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TailoredResume we want to update
     *   }
     * })
     */
    upsert<T extends TailoredResumeUpsertArgs>(args: SelectSubset<T, TailoredResumeUpsertArgs<ExtArgs>>): Prisma__TailoredResumeClient<$Result.GetResult<Prisma.$TailoredResumePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TailoredResumes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeCountArgs} args - Arguments to filter TailoredResumes to count.
     * @example
     * // Count the number of TailoredResumes
     * const count = await prisma.tailoredResume.count({
     *   where: {
     *     // ... the filter for the TailoredResumes we want to count
     *   }
     * })
    **/
    count<T extends TailoredResumeCountArgs>(
      args?: Subset<T, TailoredResumeCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TailoredResumeCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TailoredResume.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TailoredResumeAggregateArgs>(args: Subset<T, TailoredResumeAggregateArgs>): Prisma.PrismaPromise<GetTailoredResumeAggregateType<T>>

    /**
     * Group by TailoredResume.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TailoredResumeGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TailoredResumeGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TailoredResumeGroupByArgs['orderBy'] }
        : { orderBy?: TailoredResumeGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TailoredResumeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTailoredResumeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TailoredResume model
   */
  readonly fields: TailoredResumeFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TailoredResume.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TailoredResumeClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    profileVersion<T extends CandidateProfileVersionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, CandidateProfileVersionDefaultArgs<ExtArgs>>): Prisma__CandidateProfileVersionClient<$Result.GetResult<Prisma.$CandidateProfileVersionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    targetJob<T extends TargetJobDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TargetJobDefaultArgs<ExtArgs>>): Prisma__TargetJobClient<$Result.GetResult<Prisma.$TargetJobPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TailoredResume model
   */
  interface TailoredResumeFieldRefs {
    readonly id: FieldRef<"TailoredResume", 'String'>
    readonly workspaceId: FieldRef<"TailoredResume", 'String'>
    readonly profileVersionId: FieldRef<"TailoredResume", 'String'>
    readonly targetJobId: FieldRef<"TailoredResume", 'String'>
    readonly content: FieldRef<"TailoredResume", 'Json'>
    readonly templateKey: FieldRef<"TailoredResume", 'String'>
    readonly aiJobId: FieldRef<"TailoredResume", 'String'>
    readonly promptVersion: FieldRef<"TailoredResume", 'String'>
    readonly modelVersion: FieldRef<"TailoredResume", 'String'>
    readonly degraded: FieldRef<"TailoredResume", 'Boolean'>
    readonly createdAt: FieldRef<"TailoredResume", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TailoredResume findUnique
   */
  export type TailoredResumeFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter, which TailoredResume to fetch.
     */
    where: TailoredResumeWhereUniqueInput
  }

  /**
   * TailoredResume findUniqueOrThrow
   */
  export type TailoredResumeFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter, which TailoredResume to fetch.
     */
    where: TailoredResumeWhereUniqueInput
  }

  /**
   * TailoredResume findFirst
   */
  export type TailoredResumeFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter, which TailoredResume to fetch.
     */
    where?: TailoredResumeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TailoredResumes to fetch.
     */
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TailoredResumes.
     */
    cursor?: TailoredResumeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TailoredResumes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TailoredResumes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TailoredResumes.
     */
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * TailoredResume findFirstOrThrow
   */
  export type TailoredResumeFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter, which TailoredResume to fetch.
     */
    where?: TailoredResumeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TailoredResumes to fetch.
     */
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TailoredResumes.
     */
    cursor?: TailoredResumeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TailoredResumes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TailoredResumes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TailoredResumes.
     */
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * TailoredResume findMany
   */
  export type TailoredResumeFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter, which TailoredResumes to fetch.
     */
    where?: TailoredResumeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TailoredResumes to fetch.
     */
    orderBy?: TailoredResumeOrderByWithRelationInput | TailoredResumeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TailoredResumes.
     */
    cursor?: TailoredResumeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TailoredResumes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TailoredResumes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TailoredResumes.
     */
    distinct?: TailoredResumeScalarFieldEnum | TailoredResumeScalarFieldEnum[]
  }

  /**
   * TailoredResume create
   */
  export type TailoredResumeCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * The data needed to create a TailoredResume.
     */
    data: XOR<TailoredResumeCreateInput, TailoredResumeUncheckedCreateInput>
  }

  /**
   * TailoredResume createMany
   */
  export type TailoredResumeCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TailoredResumes.
     */
    data: TailoredResumeCreateManyInput | TailoredResumeCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TailoredResume createManyAndReturn
   */
  export type TailoredResumeCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * The data used to create many TailoredResumes.
     */
    data: TailoredResumeCreateManyInput | TailoredResumeCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * TailoredResume update
   */
  export type TailoredResumeUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * The data needed to update a TailoredResume.
     */
    data: XOR<TailoredResumeUpdateInput, TailoredResumeUncheckedUpdateInput>
    /**
     * Choose, which TailoredResume to update.
     */
    where: TailoredResumeWhereUniqueInput
  }

  /**
   * TailoredResume updateMany
   */
  export type TailoredResumeUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TailoredResumes.
     */
    data: XOR<TailoredResumeUpdateManyMutationInput, TailoredResumeUncheckedUpdateManyInput>
    /**
     * Filter which TailoredResumes to update
     */
    where?: TailoredResumeWhereInput
    /**
     * Limit how many TailoredResumes to update.
     */
    limit?: number
  }

  /**
   * TailoredResume updateManyAndReturn
   */
  export type TailoredResumeUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * The data used to update TailoredResumes.
     */
    data: XOR<TailoredResumeUpdateManyMutationInput, TailoredResumeUncheckedUpdateManyInput>
    /**
     * Filter which TailoredResumes to update
     */
    where?: TailoredResumeWhereInput
    /**
     * Limit how many TailoredResumes to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * TailoredResume upsert
   */
  export type TailoredResumeUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * The filter to search for the TailoredResume to update in case it exists.
     */
    where: TailoredResumeWhereUniqueInput
    /**
     * In case the TailoredResume found by the `where` argument doesn't exist, create a new TailoredResume with this data.
     */
    create: XOR<TailoredResumeCreateInput, TailoredResumeUncheckedCreateInput>
    /**
     * In case the TailoredResume was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TailoredResumeUpdateInput, TailoredResumeUncheckedUpdateInput>
  }

  /**
   * TailoredResume delete
   */
  export type TailoredResumeDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
    /**
     * Filter which TailoredResume to delete.
     */
    where: TailoredResumeWhereUniqueInput
  }

  /**
   * TailoredResume deleteMany
   */
  export type TailoredResumeDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TailoredResumes to delete
     */
    where?: TailoredResumeWhereInput
    /**
     * Limit how many TailoredResumes to delete.
     */
    limit?: number
  }

  /**
   * TailoredResume without action
   */
  export type TailoredResumeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TailoredResume
     */
    select?: TailoredResumeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TailoredResume
     */
    omit?: TailoredResumeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TailoredResumeInclude<ExtArgs> | null
  }


  /**
   * Model AiUsageLedger
   */

  export type AggregateAiUsageLedger = {
    _count: AiUsageLedgerCountAggregateOutputType | null
    _avg: AiUsageLedgerAvgAggregateOutputType | null
    _sum: AiUsageLedgerSumAggregateOutputType | null
    _min: AiUsageLedgerMinAggregateOutputType | null
    _max: AiUsageLedgerMaxAggregateOutputType | null
  }

  export type AiUsageLedgerAvgAggregateOutputType = {
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
  }

  export type AiUsageLedgerSumAggregateOutputType = {
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
  }

  export type AiUsageLedgerMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    kind: string | null
    provider: string | null
    model: string | null
    promptVersion: string | null
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
    createdAt: Date | null
  }

  export type AiUsageLedgerMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    kind: string | null
    provider: string | null
    model: string | null
    promptVersion: string | null
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
    createdAt: Date | null
  }

  export type AiUsageLedgerCountAggregateOutputType = {
    id: number
    workspaceId: number
    kind: number
    provider: number
    model: number
    promptVersion: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    createdAt: number
    _all: number
  }


  export type AiUsageLedgerAvgAggregateInputType = {
    inputTokens?: true
    outputTokens?: true
    costUsd?: true
  }

  export type AiUsageLedgerSumAggregateInputType = {
    inputTokens?: true
    outputTokens?: true
    costUsd?: true
  }

  export type AiUsageLedgerMinAggregateInputType = {
    id?: true
    workspaceId?: true
    kind?: true
    provider?: true
    model?: true
    promptVersion?: true
    inputTokens?: true
    outputTokens?: true
    costUsd?: true
    createdAt?: true
  }

  export type AiUsageLedgerMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    kind?: true
    provider?: true
    model?: true
    promptVersion?: true
    inputTokens?: true
    outputTokens?: true
    costUsd?: true
    createdAt?: true
  }

  export type AiUsageLedgerCountAggregateInputType = {
    id?: true
    workspaceId?: true
    kind?: true
    provider?: true
    model?: true
    promptVersion?: true
    inputTokens?: true
    outputTokens?: true
    costUsd?: true
    createdAt?: true
    _all?: true
  }

  export type AiUsageLedgerAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AiUsageLedger to aggregate.
     */
    where?: AiUsageLedgerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AiUsageLedgers to fetch.
     */
    orderBy?: AiUsageLedgerOrderByWithRelationInput | AiUsageLedgerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AiUsageLedgerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AiUsageLedgers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AiUsageLedgers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AiUsageLedgers
    **/
    _count?: true | AiUsageLedgerCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AiUsageLedgerAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AiUsageLedgerSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AiUsageLedgerMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AiUsageLedgerMaxAggregateInputType
  }

  export type GetAiUsageLedgerAggregateType<T extends AiUsageLedgerAggregateArgs> = {
        [P in keyof T & keyof AggregateAiUsageLedger]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAiUsageLedger[P]>
      : GetScalarType<T[P], AggregateAiUsageLedger[P]>
  }




  export type AiUsageLedgerGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AiUsageLedgerWhereInput
    orderBy?: AiUsageLedgerOrderByWithAggregationInput | AiUsageLedgerOrderByWithAggregationInput[]
    by: AiUsageLedgerScalarFieldEnum[] | AiUsageLedgerScalarFieldEnum
    having?: AiUsageLedgerScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AiUsageLedgerCountAggregateInputType | true
    _avg?: AiUsageLedgerAvgAggregateInputType
    _sum?: AiUsageLedgerSumAggregateInputType
    _min?: AiUsageLedgerMinAggregateInputType
    _max?: AiUsageLedgerMaxAggregateInputType
  }

  export type AiUsageLedgerGroupByOutputType = {
    id: string
    workspaceId: string
    kind: string
    provider: string
    model: string
    promptVersion: string | null
    inputTokens: number
    outputTokens: number
    costUsd: number
    createdAt: Date
    _count: AiUsageLedgerCountAggregateOutputType | null
    _avg: AiUsageLedgerAvgAggregateOutputType | null
    _sum: AiUsageLedgerSumAggregateOutputType | null
    _min: AiUsageLedgerMinAggregateOutputType | null
    _max: AiUsageLedgerMaxAggregateOutputType | null
  }

  type GetAiUsageLedgerGroupByPayload<T extends AiUsageLedgerGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AiUsageLedgerGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AiUsageLedgerGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AiUsageLedgerGroupByOutputType[P]>
            : GetScalarType<T[P], AiUsageLedgerGroupByOutputType[P]>
        }
      >
    >


  export type AiUsageLedgerSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    kind?: boolean
    provider?: boolean
    model?: boolean
    promptVersion?: boolean
    inputTokens?: boolean
    outputTokens?: boolean
    costUsd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["aiUsageLedger"]>

  export type AiUsageLedgerSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    kind?: boolean
    provider?: boolean
    model?: boolean
    promptVersion?: boolean
    inputTokens?: boolean
    outputTokens?: boolean
    costUsd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["aiUsageLedger"]>

  export type AiUsageLedgerSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    kind?: boolean
    provider?: boolean
    model?: boolean
    promptVersion?: boolean
    inputTokens?: boolean
    outputTokens?: boolean
    costUsd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["aiUsageLedger"]>

  export type AiUsageLedgerSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    kind?: boolean
    provider?: boolean
    model?: boolean
    promptVersion?: boolean
    inputTokens?: boolean
    outputTokens?: boolean
    costUsd?: boolean
    createdAt?: boolean
  }

  export type AiUsageLedgerOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "kind" | "provider" | "model" | "promptVersion" | "inputTokens" | "outputTokens" | "costUsd" | "createdAt", ExtArgs["result"]["aiUsageLedger"]>

  export type $AiUsageLedgerPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AiUsageLedger"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      /**
       * "tailor" today (the CV-tailoring provider call). See
       * lib/tailoring/ai/quota.ts.
       */
      kind: string
      provider: string
      model: string
      promptVersion: string | null
      inputTokens: number
      outputTokens: number
      costUsd: number
      createdAt: Date
    }, ExtArgs["result"]["aiUsageLedger"]>
    composites: {}
  }

  type AiUsageLedgerGetPayload<S extends boolean | null | undefined | AiUsageLedgerDefaultArgs> = $Result.GetResult<Prisma.$AiUsageLedgerPayload, S>

  type AiUsageLedgerCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AiUsageLedgerFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AiUsageLedgerCountAggregateInputType | true
    }

  export interface AiUsageLedgerDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AiUsageLedger'], meta: { name: 'AiUsageLedger' } }
    /**
     * Find zero or one AiUsageLedger that matches the filter.
     * @param {AiUsageLedgerFindUniqueArgs} args - Arguments to find a AiUsageLedger
     * @example
     * // Get one AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AiUsageLedgerFindUniqueArgs>(args: SelectSubset<T, AiUsageLedgerFindUniqueArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AiUsageLedger that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AiUsageLedgerFindUniqueOrThrowArgs} args - Arguments to find a AiUsageLedger
     * @example
     * // Get one AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AiUsageLedgerFindUniqueOrThrowArgs>(args: SelectSubset<T, AiUsageLedgerFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AiUsageLedger that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerFindFirstArgs} args - Arguments to find a AiUsageLedger
     * @example
     * // Get one AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AiUsageLedgerFindFirstArgs>(args?: SelectSubset<T, AiUsageLedgerFindFirstArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AiUsageLedger that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerFindFirstOrThrowArgs} args - Arguments to find a AiUsageLedger
     * @example
     * // Get one AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AiUsageLedgerFindFirstOrThrowArgs>(args?: SelectSubset<T, AiUsageLedgerFindFirstOrThrowArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AiUsageLedgers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AiUsageLedgers
     * const aiUsageLedgers = await prisma.aiUsageLedger.findMany()
     * 
     * // Get first 10 AiUsageLedgers
     * const aiUsageLedgers = await prisma.aiUsageLedger.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const aiUsageLedgerWithIdOnly = await prisma.aiUsageLedger.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AiUsageLedgerFindManyArgs>(args?: SelectSubset<T, AiUsageLedgerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AiUsageLedger.
     * @param {AiUsageLedgerCreateArgs} args - Arguments to create a AiUsageLedger.
     * @example
     * // Create one AiUsageLedger
     * const AiUsageLedger = await prisma.aiUsageLedger.create({
     *   data: {
     *     // ... data to create a AiUsageLedger
     *   }
     * })
     * 
     */
    create<T extends AiUsageLedgerCreateArgs>(args: SelectSubset<T, AiUsageLedgerCreateArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AiUsageLedgers.
     * @param {AiUsageLedgerCreateManyArgs} args - Arguments to create many AiUsageLedgers.
     * @example
     * // Create many AiUsageLedgers
     * const aiUsageLedger = await prisma.aiUsageLedger.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AiUsageLedgerCreateManyArgs>(args?: SelectSubset<T, AiUsageLedgerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AiUsageLedgers and returns the data saved in the database.
     * @param {AiUsageLedgerCreateManyAndReturnArgs} args - Arguments to create many AiUsageLedgers.
     * @example
     * // Create many AiUsageLedgers
     * const aiUsageLedger = await prisma.aiUsageLedger.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AiUsageLedgers and only return the `id`
     * const aiUsageLedgerWithIdOnly = await prisma.aiUsageLedger.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AiUsageLedgerCreateManyAndReturnArgs>(args?: SelectSubset<T, AiUsageLedgerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AiUsageLedger.
     * @param {AiUsageLedgerDeleteArgs} args - Arguments to delete one AiUsageLedger.
     * @example
     * // Delete one AiUsageLedger
     * const AiUsageLedger = await prisma.aiUsageLedger.delete({
     *   where: {
     *     // ... filter to delete one AiUsageLedger
     *   }
     * })
     * 
     */
    delete<T extends AiUsageLedgerDeleteArgs>(args: SelectSubset<T, AiUsageLedgerDeleteArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AiUsageLedger.
     * @param {AiUsageLedgerUpdateArgs} args - Arguments to update one AiUsageLedger.
     * @example
     * // Update one AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AiUsageLedgerUpdateArgs>(args: SelectSubset<T, AiUsageLedgerUpdateArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AiUsageLedgers.
     * @param {AiUsageLedgerDeleteManyArgs} args - Arguments to filter AiUsageLedgers to delete.
     * @example
     * // Delete a few AiUsageLedgers
     * const { count } = await prisma.aiUsageLedger.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AiUsageLedgerDeleteManyArgs>(args?: SelectSubset<T, AiUsageLedgerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AiUsageLedgers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AiUsageLedgers
     * const aiUsageLedger = await prisma.aiUsageLedger.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AiUsageLedgerUpdateManyArgs>(args: SelectSubset<T, AiUsageLedgerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AiUsageLedgers and returns the data updated in the database.
     * @param {AiUsageLedgerUpdateManyAndReturnArgs} args - Arguments to update many AiUsageLedgers.
     * @example
     * // Update many AiUsageLedgers
     * const aiUsageLedger = await prisma.aiUsageLedger.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AiUsageLedgers and only return the `id`
     * const aiUsageLedgerWithIdOnly = await prisma.aiUsageLedger.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AiUsageLedgerUpdateManyAndReturnArgs>(args: SelectSubset<T, AiUsageLedgerUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AiUsageLedger.
     * @param {AiUsageLedgerUpsertArgs} args - Arguments to update or create a AiUsageLedger.
     * @example
     * // Update or create a AiUsageLedger
     * const aiUsageLedger = await prisma.aiUsageLedger.upsert({
     *   create: {
     *     // ... data to create a AiUsageLedger
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AiUsageLedger we want to update
     *   }
     * })
     */
    upsert<T extends AiUsageLedgerUpsertArgs>(args: SelectSubset<T, AiUsageLedgerUpsertArgs<ExtArgs>>): Prisma__AiUsageLedgerClient<$Result.GetResult<Prisma.$AiUsageLedgerPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AiUsageLedgers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerCountArgs} args - Arguments to filter AiUsageLedgers to count.
     * @example
     * // Count the number of AiUsageLedgers
     * const count = await prisma.aiUsageLedger.count({
     *   where: {
     *     // ... the filter for the AiUsageLedgers we want to count
     *   }
     * })
    **/
    count<T extends AiUsageLedgerCountArgs>(
      args?: Subset<T, AiUsageLedgerCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AiUsageLedgerCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AiUsageLedger.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AiUsageLedgerAggregateArgs>(args: Subset<T, AiUsageLedgerAggregateArgs>): Prisma.PrismaPromise<GetAiUsageLedgerAggregateType<T>>

    /**
     * Group by AiUsageLedger.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AiUsageLedgerGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AiUsageLedgerGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AiUsageLedgerGroupByArgs['orderBy'] }
        : { orderBy?: AiUsageLedgerGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AiUsageLedgerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAiUsageLedgerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AiUsageLedger model
   */
  readonly fields: AiUsageLedgerFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AiUsageLedger.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AiUsageLedgerClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AiUsageLedger model
   */
  interface AiUsageLedgerFieldRefs {
    readonly id: FieldRef<"AiUsageLedger", 'String'>
    readonly workspaceId: FieldRef<"AiUsageLedger", 'String'>
    readonly kind: FieldRef<"AiUsageLedger", 'String'>
    readonly provider: FieldRef<"AiUsageLedger", 'String'>
    readonly model: FieldRef<"AiUsageLedger", 'String'>
    readonly promptVersion: FieldRef<"AiUsageLedger", 'String'>
    readonly inputTokens: FieldRef<"AiUsageLedger", 'Int'>
    readonly outputTokens: FieldRef<"AiUsageLedger", 'Int'>
    readonly costUsd: FieldRef<"AiUsageLedger", 'Float'>
    readonly createdAt: FieldRef<"AiUsageLedger", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AiUsageLedger findUnique
   */
  export type AiUsageLedgerFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter, which AiUsageLedger to fetch.
     */
    where: AiUsageLedgerWhereUniqueInput
  }

  /**
   * AiUsageLedger findUniqueOrThrow
   */
  export type AiUsageLedgerFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter, which AiUsageLedger to fetch.
     */
    where: AiUsageLedgerWhereUniqueInput
  }

  /**
   * AiUsageLedger findFirst
   */
  export type AiUsageLedgerFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter, which AiUsageLedger to fetch.
     */
    where?: AiUsageLedgerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AiUsageLedgers to fetch.
     */
    orderBy?: AiUsageLedgerOrderByWithRelationInput | AiUsageLedgerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AiUsageLedgers.
     */
    cursor?: AiUsageLedgerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AiUsageLedgers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AiUsageLedgers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AiUsageLedgers.
     */
    distinct?: AiUsageLedgerScalarFieldEnum | AiUsageLedgerScalarFieldEnum[]
  }

  /**
   * AiUsageLedger findFirstOrThrow
   */
  export type AiUsageLedgerFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter, which AiUsageLedger to fetch.
     */
    where?: AiUsageLedgerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AiUsageLedgers to fetch.
     */
    orderBy?: AiUsageLedgerOrderByWithRelationInput | AiUsageLedgerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AiUsageLedgers.
     */
    cursor?: AiUsageLedgerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AiUsageLedgers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AiUsageLedgers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AiUsageLedgers.
     */
    distinct?: AiUsageLedgerScalarFieldEnum | AiUsageLedgerScalarFieldEnum[]
  }

  /**
   * AiUsageLedger findMany
   */
  export type AiUsageLedgerFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter, which AiUsageLedgers to fetch.
     */
    where?: AiUsageLedgerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AiUsageLedgers to fetch.
     */
    orderBy?: AiUsageLedgerOrderByWithRelationInput | AiUsageLedgerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AiUsageLedgers.
     */
    cursor?: AiUsageLedgerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AiUsageLedgers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AiUsageLedgers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AiUsageLedgers.
     */
    distinct?: AiUsageLedgerScalarFieldEnum | AiUsageLedgerScalarFieldEnum[]
  }

  /**
   * AiUsageLedger create
   */
  export type AiUsageLedgerCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * The data needed to create a AiUsageLedger.
     */
    data: XOR<AiUsageLedgerCreateInput, AiUsageLedgerUncheckedCreateInput>
  }

  /**
   * AiUsageLedger createMany
   */
  export type AiUsageLedgerCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AiUsageLedgers.
     */
    data: AiUsageLedgerCreateManyInput | AiUsageLedgerCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AiUsageLedger createManyAndReturn
   */
  export type AiUsageLedgerCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * The data used to create many AiUsageLedgers.
     */
    data: AiUsageLedgerCreateManyInput | AiUsageLedgerCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AiUsageLedger update
   */
  export type AiUsageLedgerUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * The data needed to update a AiUsageLedger.
     */
    data: XOR<AiUsageLedgerUpdateInput, AiUsageLedgerUncheckedUpdateInput>
    /**
     * Choose, which AiUsageLedger to update.
     */
    where: AiUsageLedgerWhereUniqueInput
  }

  /**
   * AiUsageLedger updateMany
   */
  export type AiUsageLedgerUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AiUsageLedgers.
     */
    data: XOR<AiUsageLedgerUpdateManyMutationInput, AiUsageLedgerUncheckedUpdateManyInput>
    /**
     * Filter which AiUsageLedgers to update
     */
    where?: AiUsageLedgerWhereInput
    /**
     * Limit how many AiUsageLedgers to update.
     */
    limit?: number
  }

  /**
   * AiUsageLedger updateManyAndReturn
   */
  export type AiUsageLedgerUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * The data used to update AiUsageLedgers.
     */
    data: XOR<AiUsageLedgerUpdateManyMutationInput, AiUsageLedgerUncheckedUpdateManyInput>
    /**
     * Filter which AiUsageLedgers to update
     */
    where?: AiUsageLedgerWhereInput
    /**
     * Limit how many AiUsageLedgers to update.
     */
    limit?: number
  }

  /**
   * AiUsageLedger upsert
   */
  export type AiUsageLedgerUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * The filter to search for the AiUsageLedger to update in case it exists.
     */
    where: AiUsageLedgerWhereUniqueInput
    /**
     * In case the AiUsageLedger found by the `where` argument doesn't exist, create a new AiUsageLedger with this data.
     */
    create: XOR<AiUsageLedgerCreateInput, AiUsageLedgerUncheckedCreateInput>
    /**
     * In case the AiUsageLedger was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AiUsageLedgerUpdateInput, AiUsageLedgerUncheckedUpdateInput>
  }

  /**
   * AiUsageLedger delete
   */
  export type AiUsageLedgerDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
    /**
     * Filter which AiUsageLedger to delete.
     */
    where: AiUsageLedgerWhereUniqueInput
  }

  /**
   * AiUsageLedger deleteMany
   */
  export type AiUsageLedgerDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AiUsageLedgers to delete
     */
    where?: AiUsageLedgerWhereInput
    /**
     * Limit how many AiUsageLedgers to delete.
     */
    limit?: number
  }

  /**
   * AiUsageLedger without action
   */
  export type AiUsageLedgerDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AiUsageLedger
     */
    select?: AiUsageLedgerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AiUsageLedger
     */
    omit?: AiUsageLedgerOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const WorkspaceScalarFieldEnum: {
    id: 'id',
    platformUserId: 'platformUserId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkspaceScalarFieldEnum = (typeof WorkspaceScalarFieldEnum)[keyof typeof WorkspaceScalarFieldEnum]


  export const AuditEventScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    action: 'action',
    metadata: 'metadata',
    createdAt: 'createdAt'
  };

  export type AuditEventScalarFieldEnum = (typeof AuditEventScalarFieldEnum)[keyof typeof AuditEventScalarFieldEnum]


  export const CandidateDocumentScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    storageKey: 'storageKey',
    originalFilename: 'originalFilename',
    contentType: 'contentType',
    byteSize: 'byteSize',
    contentHash: 'contentHash',
    status: 'status',
    reasonCode: 'reasonCode',
    scannerName: 'scannerName',
    scannedAt: 'scannedAt',
    extractionAttempts: 'extractionAttempts',
    extractionStartedAt: 'extractionStartedAt',
    retainUntil: 'retainUntil',
    uploadedAt: 'uploadedAt',
    deletedAt: 'deletedAt'
  };

  export type CandidateDocumentScalarFieldEnum = (typeof CandidateDocumentScalarFieldEnum)[keyof typeof CandidateDocumentScalarFieldEnum]


  export const CandidateProfileScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    confirmedVersionId: 'confirmedVersionId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type CandidateProfileScalarFieldEnum = (typeof CandidateProfileScalarFieldEnum)[keyof typeof CandidateProfileScalarFieldEnum]


  export const CandidateProfileVersionScalarFieldEnum: {
    id: 'id',
    profileId: 'profileId',
    versionNumber: 'versionNumber',
    origin: 'origin',
    parentVersionId: 'parentVersionId',
    documentId: 'documentId',
    sourceContentHash: 'sourceContentHash',
    extractorName: 'extractorName',
    extractorVersion: 'extractorVersion',
    content: 'content',
    confidence: 'confidence',
    createdAt: 'createdAt'
  };

  export type CandidateProfileVersionScalarFieldEnum = (typeof CandidateProfileVersionScalarFieldEnum)[keyof typeof CandidateProfileVersionScalarFieldEnum]


  export const TargetJobScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    sourceUrl: 'sourceUrl',
    rawText: 'rawText',
    title: 'title',
    employer: 'employer',
    status: 'status',
    fetchedAt: 'fetchedAt',
    createdAt: 'createdAt'
  };

  export type TargetJobScalarFieldEnum = (typeof TargetJobScalarFieldEnum)[keyof typeof TargetJobScalarFieldEnum]


  export const TailoredResumeScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    profileVersionId: 'profileVersionId',
    targetJobId: 'targetJobId',
    content: 'content',
    templateKey: 'templateKey',
    aiJobId: 'aiJobId',
    promptVersion: 'promptVersion',
    modelVersion: 'modelVersion',
    degraded: 'degraded',
    createdAt: 'createdAt'
  };

  export type TailoredResumeScalarFieldEnum = (typeof TailoredResumeScalarFieldEnum)[keyof typeof TailoredResumeScalarFieldEnum]


  export const AiUsageLedgerScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    kind: 'kind',
    provider: 'provider',
    model: 'model',
    promptVersion: 'promptVersion',
    inputTokens: 'inputTokens',
    outputTokens: 'outputTokens',
    costUsd: 'costUsd',
    createdAt: 'createdAt'
  };

  export type AiUsageLedgerScalarFieldEnum = (typeof AiUsageLedgerScalarFieldEnum)[keyof typeof AiUsageLedgerScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DocumentStatus'
   */
  export type EnumDocumentStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DocumentStatus'>
    


  /**
   * Reference to a field of type 'DocumentStatus[]'
   */
  export type ListEnumDocumentStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DocumentStatus[]'>
    


  /**
   * Reference to a field of type 'DocumentReasonCode'
   */
  export type EnumDocumentReasonCodeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DocumentReasonCode'>
    


  /**
   * Reference to a field of type 'DocumentReasonCode[]'
   */
  export type ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DocumentReasonCode[]'>
    


  /**
   * Reference to a field of type 'ProfileVersionOrigin'
   */
  export type EnumProfileVersionOriginFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ProfileVersionOrigin'>
    


  /**
   * Reference to a field of type 'ProfileVersionOrigin[]'
   */
  export type ListEnumProfileVersionOriginFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ProfileVersionOrigin[]'>
    


  /**
   * Reference to a field of type 'TargetJobStatus'
   */
  export type EnumTargetJobStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TargetJobStatus'>
    


  /**
   * Reference to a field of type 'TargetJobStatus[]'
   */
  export type ListEnumTargetJobStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TargetJobStatus[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type WorkspaceWhereInput = {
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    id?: StringFilter<"Workspace"> | string
    platformUserId?: StringFilter<"Workspace"> | string
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    auditEvents?: AuditEventListRelationFilter
    documents?: CandidateDocumentListRelationFilter
    profile?: XOR<CandidateProfileNullableScalarRelationFilter, CandidateProfileWhereInput> | null
    targetJobs?: TargetJobListRelationFilter
    tailoredResumes?: TailoredResumeListRelationFilter
  }

  export type WorkspaceOrderByWithRelationInput = {
    id?: SortOrder
    platformUserId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    auditEvents?: AuditEventOrderByRelationAggregateInput
    documents?: CandidateDocumentOrderByRelationAggregateInput
    profile?: CandidateProfileOrderByWithRelationInput
    targetJobs?: TargetJobOrderByRelationAggregateInput
    tailoredResumes?: TailoredResumeOrderByRelationAggregateInput
  }

  export type WorkspaceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    platformUserId?: string
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    auditEvents?: AuditEventListRelationFilter
    documents?: CandidateDocumentListRelationFilter
    profile?: XOR<CandidateProfileNullableScalarRelationFilter, CandidateProfileWhereInput> | null
    targetJobs?: TargetJobListRelationFilter
    tailoredResumes?: TailoredResumeListRelationFilter
  }, "id" | "platformUserId">

  export type WorkspaceOrderByWithAggregationInput = {
    id?: SortOrder
    platformUserId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkspaceCountOrderByAggregateInput
    _max?: WorkspaceMaxOrderByAggregateInput
    _min?: WorkspaceMinOrderByAggregateInput
  }

  export type WorkspaceScalarWhereWithAggregatesInput = {
    AND?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    OR?: WorkspaceScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Workspace"> | string
    platformUserId?: StringWithAggregatesFilter<"Workspace"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
  }

  export type AuditEventWhereInput = {
    AND?: AuditEventWhereInput | AuditEventWhereInput[]
    OR?: AuditEventWhereInput[]
    NOT?: AuditEventWhereInput | AuditEventWhereInput[]
    id?: StringFilter<"AuditEvent"> | string
    workspaceId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    metadata?: JsonNullableFilter<"AuditEvent">
    createdAt?: DateTimeFilter<"AuditEvent"> | Date | string
    workspace?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
  }

  export type AuditEventOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    action?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
  }

  export type AuditEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AuditEventWhereInput | AuditEventWhereInput[]
    OR?: AuditEventWhereInput[]
    NOT?: AuditEventWhereInput | AuditEventWhereInput[]
    workspaceId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    metadata?: JsonNullableFilter<"AuditEvent">
    createdAt?: DateTimeFilter<"AuditEvent"> | Date | string
    workspace?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
  }, "id">

  export type AuditEventOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    action?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: AuditEventCountOrderByAggregateInput
    _max?: AuditEventMaxOrderByAggregateInput
    _min?: AuditEventMinOrderByAggregateInput
  }

  export type AuditEventScalarWhereWithAggregatesInput = {
    AND?: AuditEventScalarWhereWithAggregatesInput | AuditEventScalarWhereWithAggregatesInput[]
    OR?: AuditEventScalarWhereWithAggregatesInput[]
    NOT?: AuditEventScalarWhereWithAggregatesInput | AuditEventScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AuditEvent"> | string
    workspaceId?: StringNullableWithAggregatesFilter<"AuditEvent"> | string | null
    action?: StringWithAggregatesFilter<"AuditEvent"> | string
    metadata?: JsonNullableWithAggregatesFilter<"AuditEvent">
    createdAt?: DateTimeWithAggregatesFilter<"AuditEvent"> | Date | string
  }

  export type CandidateDocumentWhereInput = {
    AND?: CandidateDocumentWhereInput | CandidateDocumentWhereInput[]
    OR?: CandidateDocumentWhereInput[]
    NOT?: CandidateDocumentWhereInput | CandidateDocumentWhereInput[]
    id?: StringFilter<"CandidateDocument"> | string
    workspaceId?: StringFilter<"CandidateDocument"> | string
    storageKey?: StringFilter<"CandidateDocument"> | string
    originalFilename?: StringFilter<"CandidateDocument"> | string
    contentType?: StringFilter<"CandidateDocument"> | string
    byteSize?: IntFilter<"CandidateDocument"> | number
    contentHash?: StringFilter<"CandidateDocument"> | string
    status?: EnumDocumentStatusFilter<"CandidateDocument"> | $Enums.DocumentStatus
    reasonCode?: EnumDocumentReasonCodeNullableFilter<"CandidateDocument"> | $Enums.DocumentReasonCode | null
    scannerName?: StringNullableFilter<"CandidateDocument"> | string | null
    scannedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    extractionAttempts?: IntFilter<"CandidateDocument"> | number
    extractionStartedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    retainUntil?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    uploadedAt?: DateTimeFilter<"CandidateDocument"> | Date | string
    deletedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    profileVersions?: CandidateProfileVersionListRelationFilter
  }

  export type CandidateDocumentOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    storageKey?: SortOrder
    originalFilename?: SortOrder
    contentType?: SortOrder
    byteSize?: SortOrder
    contentHash?: SortOrder
    status?: SortOrder
    reasonCode?: SortOrderInput | SortOrder
    scannerName?: SortOrderInput | SortOrder
    scannedAt?: SortOrderInput | SortOrder
    extractionAttempts?: SortOrder
    extractionStartedAt?: SortOrderInput | SortOrder
    retainUntil?: SortOrderInput | SortOrder
    uploadedAt?: SortOrder
    deletedAt?: SortOrderInput | SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    profileVersions?: CandidateProfileVersionOrderByRelationAggregateInput
  }

  export type CandidateDocumentWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    storageKey?: string
    AND?: CandidateDocumentWhereInput | CandidateDocumentWhereInput[]
    OR?: CandidateDocumentWhereInput[]
    NOT?: CandidateDocumentWhereInput | CandidateDocumentWhereInput[]
    workspaceId?: StringFilter<"CandidateDocument"> | string
    originalFilename?: StringFilter<"CandidateDocument"> | string
    contentType?: StringFilter<"CandidateDocument"> | string
    byteSize?: IntFilter<"CandidateDocument"> | number
    contentHash?: StringFilter<"CandidateDocument"> | string
    status?: EnumDocumentStatusFilter<"CandidateDocument"> | $Enums.DocumentStatus
    reasonCode?: EnumDocumentReasonCodeNullableFilter<"CandidateDocument"> | $Enums.DocumentReasonCode | null
    scannerName?: StringNullableFilter<"CandidateDocument"> | string | null
    scannedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    extractionAttempts?: IntFilter<"CandidateDocument"> | number
    extractionStartedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    retainUntil?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    uploadedAt?: DateTimeFilter<"CandidateDocument"> | Date | string
    deletedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    profileVersions?: CandidateProfileVersionListRelationFilter
  }, "id" | "storageKey">

  export type CandidateDocumentOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    storageKey?: SortOrder
    originalFilename?: SortOrder
    contentType?: SortOrder
    byteSize?: SortOrder
    contentHash?: SortOrder
    status?: SortOrder
    reasonCode?: SortOrderInput | SortOrder
    scannerName?: SortOrderInput | SortOrder
    scannedAt?: SortOrderInput | SortOrder
    extractionAttempts?: SortOrder
    extractionStartedAt?: SortOrderInput | SortOrder
    retainUntil?: SortOrderInput | SortOrder
    uploadedAt?: SortOrder
    deletedAt?: SortOrderInput | SortOrder
    _count?: CandidateDocumentCountOrderByAggregateInput
    _avg?: CandidateDocumentAvgOrderByAggregateInput
    _max?: CandidateDocumentMaxOrderByAggregateInput
    _min?: CandidateDocumentMinOrderByAggregateInput
    _sum?: CandidateDocumentSumOrderByAggregateInput
  }

  export type CandidateDocumentScalarWhereWithAggregatesInput = {
    AND?: CandidateDocumentScalarWhereWithAggregatesInput | CandidateDocumentScalarWhereWithAggregatesInput[]
    OR?: CandidateDocumentScalarWhereWithAggregatesInput[]
    NOT?: CandidateDocumentScalarWhereWithAggregatesInput | CandidateDocumentScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CandidateDocument"> | string
    workspaceId?: StringWithAggregatesFilter<"CandidateDocument"> | string
    storageKey?: StringWithAggregatesFilter<"CandidateDocument"> | string
    originalFilename?: StringWithAggregatesFilter<"CandidateDocument"> | string
    contentType?: StringWithAggregatesFilter<"CandidateDocument"> | string
    byteSize?: IntWithAggregatesFilter<"CandidateDocument"> | number
    contentHash?: StringWithAggregatesFilter<"CandidateDocument"> | string
    status?: EnumDocumentStatusWithAggregatesFilter<"CandidateDocument"> | $Enums.DocumentStatus
    reasonCode?: EnumDocumentReasonCodeNullableWithAggregatesFilter<"CandidateDocument"> | $Enums.DocumentReasonCode | null
    scannerName?: StringNullableWithAggregatesFilter<"CandidateDocument"> | string | null
    scannedAt?: DateTimeNullableWithAggregatesFilter<"CandidateDocument"> | Date | string | null
    extractionAttempts?: IntWithAggregatesFilter<"CandidateDocument"> | number
    extractionStartedAt?: DateTimeNullableWithAggregatesFilter<"CandidateDocument"> | Date | string | null
    retainUntil?: DateTimeNullableWithAggregatesFilter<"CandidateDocument"> | Date | string | null
    uploadedAt?: DateTimeWithAggregatesFilter<"CandidateDocument"> | Date | string
    deletedAt?: DateTimeNullableWithAggregatesFilter<"CandidateDocument"> | Date | string | null
  }

  export type CandidateProfileWhereInput = {
    AND?: CandidateProfileWhereInput | CandidateProfileWhereInput[]
    OR?: CandidateProfileWhereInput[]
    NOT?: CandidateProfileWhereInput | CandidateProfileWhereInput[]
    id?: StringFilter<"CandidateProfile"> | string
    workspaceId?: StringFilter<"CandidateProfile"> | string
    confirmedVersionId?: StringNullableFilter<"CandidateProfile"> | string | null
    createdAt?: DateTimeFilter<"CandidateProfile"> | Date | string
    updatedAt?: DateTimeFilter<"CandidateProfile"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    confirmedVersion?: XOR<CandidateProfileVersionNullableScalarRelationFilter, CandidateProfileVersionWhereInput> | null
    versions?: CandidateProfileVersionListRelationFilter
  }

  export type CandidateProfileOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    confirmedVersionId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    confirmedVersion?: CandidateProfileVersionOrderByWithRelationInput
    versions?: CandidateProfileVersionOrderByRelationAggregateInput
  }

  export type CandidateProfileWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId?: string
    confirmedVersionId?: string
    AND?: CandidateProfileWhereInput | CandidateProfileWhereInput[]
    OR?: CandidateProfileWhereInput[]
    NOT?: CandidateProfileWhereInput | CandidateProfileWhereInput[]
    createdAt?: DateTimeFilter<"CandidateProfile"> | Date | string
    updatedAt?: DateTimeFilter<"CandidateProfile"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    confirmedVersion?: XOR<CandidateProfileVersionNullableScalarRelationFilter, CandidateProfileVersionWhereInput> | null
    versions?: CandidateProfileVersionListRelationFilter
  }, "id" | "workspaceId" | "confirmedVersionId">

  export type CandidateProfileOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    confirmedVersionId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: CandidateProfileCountOrderByAggregateInput
    _max?: CandidateProfileMaxOrderByAggregateInput
    _min?: CandidateProfileMinOrderByAggregateInput
  }

  export type CandidateProfileScalarWhereWithAggregatesInput = {
    AND?: CandidateProfileScalarWhereWithAggregatesInput | CandidateProfileScalarWhereWithAggregatesInput[]
    OR?: CandidateProfileScalarWhereWithAggregatesInput[]
    NOT?: CandidateProfileScalarWhereWithAggregatesInput | CandidateProfileScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CandidateProfile"> | string
    workspaceId?: StringWithAggregatesFilter<"CandidateProfile"> | string
    confirmedVersionId?: StringNullableWithAggregatesFilter<"CandidateProfile"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"CandidateProfile"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"CandidateProfile"> | Date | string
  }

  export type CandidateProfileVersionWhereInput = {
    AND?: CandidateProfileVersionWhereInput | CandidateProfileVersionWhereInput[]
    OR?: CandidateProfileVersionWhereInput[]
    NOT?: CandidateProfileVersionWhereInput | CandidateProfileVersionWhereInput[]
    id?: StringFilter<"CandidateProfileVersion"> | string
    profileId?: StringFilter<"CandidateProfileVersion"> | string
    versionNumber?: IntFilter<"CandidateProfileVersion"> | number
    origin?: EnumProfileVersionOriginFilter<"CandidateProfileVersion"> | $Enums.ProfileVersionOrigin
    parentVersionId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    documentId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    sourceContentHash?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    extractorName?: StringFilter<"CandidateProfileVersion"> | string
    extractorVersion?: StringFilter<"CandidateProfileVersion"> | string
    content?: JsonFilter<"CandidateProfileVersion">
    confidence?: JsonNullableFilter<"CandidateProfileVersion">
    createdAt?: DateTimeFilter<"CandidateProfileVersion"> | Date | string
    profile?: XOR<CandidateProfileScalarRelationFilter, CandidateProfileWhereInput>
    parentVersion?: XOR<CandidateProfileVersionNullableScalarRelationFilter, CandidateProfileVersionWhereInput> | null
    children?: CandidateProfileVersionListRelationFilter
    document?: XOR<CandidateDocumentNullableScalarRelationFilter, CandidateDocumentWhereInput> | null
    confirmedFor?: XOR<CandidateProfileNullableScalarRelationFilter, CandidateProfileWhereInput> | null
    tailoredResumes?: TailoredResumeListRelationFilter
  }

  export type CandidateProfileVersionOrderByWithRelationInput = {
    id?: SortOrder
    profileId?: SortOrder
    versionNumber?: SortOrder
    origin?: SortOrder
    parentVersionId?: SortOrderInput | SortOrder
    documentId?: SortOrderInput | SortOrder
    sourceContentHash?: SortOrderInput | SortOrder
    extractorName?: SortOrder
    extractorVersion?: SortOrder
    content?: SortOrder
    confidence?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    profile?: CandidateProfileOrderByWithRelationInput
    parentVersion?: CandidateProfileVersionOrderByWithRelationInput
    children?: CandidateProfileVersionOrderByRelationAggregateInput
    document?: CandidateDocumentOrderByWithRelationInput
    confirmedFor?: CandidateProfileOrderByWithRelationInput
    tailoredResumes?: TailoredResumeOrderByRelationAggregateInput
  }

  export type CandidateProfileVersionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    profileId_versionNumber?: CandidateProfileVersionProfileIdVersionNumberCompoundUniqueInput
    AND?: CandidateProfileVersionWhereInput | CandidateProfileVersionWhereInput[]
    OR?: CandidateProfileVersionWhereInput[]
    NOT?: CandidateProfileVersionWhereInput | CandidateProfileVersionWhereInput[]
    profileId?: StringFilter<"CandidateProfileVersion"> | string
    versionNumber?: IntFilter<"CandidateProfileVersion"> | number
    origin?: EnumProfileVersionOriginFilter<"CandidateProfileVersion"> | $Enums.ProfileVersionOrigin
    parentVersionId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    documentId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    sourceContentHash?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    extractorName?: StringFilter<"CandidateProfileVersion"> | string
    extractorVersion?: StringFilter<"CandidateProfileVersion"> | string
    content?: JsonFilter<"CandidateProfileVersion">
    confidence?: JsonNullableFilter<"CandidateProfileVersion">
    createdAt?: DateTimeFilter<"CandidateProfileVersion"> | Date | string
    profile?: XOR<CandidateProfileScalarRelationFilter, CandidateProfileWhereInput>
    parentVersion?: XOR<CandidateProfileVersionNullableScalarRelationFilter, CandidateProfileVersionWhereInput> | null
    children?: CandidateProfileVersionListRelationFilter
    document?: XOR<CandidateDocumentNullableScalarRelationFilter, CandidateDocumentWhereInput> | null
    confirmedFor?: XOR<CandidateProfileNullableScalarRelationFilter, CandidateProfileWhereInput> | null
    tailoredResumes?: TailoredResumeListRelationFilter
  }, "id" | "profileId_versionNumber">

  export type CandidateProfileVersionOrderByWithAggregationInput = {
    id?: SortOrder
    profileId?: SortOrder
    versionNumber?: SortOrder
    origin?: SortOrder
    parentVersionId?: SortOrderInput | SortOrder
    documentId?: SortOrderInput | SortOrder
    sourceContentHash?: SortOrderInput | SortOrder
    extractorName?: SortOrder
    extractorVersion?: SortOrder
    content?: SortOrder
    confidence?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: CandidateProfileVersionCountOrderByAggregateInput
    _avg?: CandidateProfileVersionAvgOrderByAggregateInput
    _max?: CandidateProfileVersionMaxOrderByAggregateInput
    _min?: CandidateProfileVersionMinOrderByAggregateInput
    _sum?: CandidateProfileVersionSumOrderByAggregateInput
  }

  export type CandidateProfileVersionScalarWhereWithAggregatesInput = {
    AND?: CandidateProfileVersionScalarWhereWithAggregatesInput | CandidateProfileVersionScalarWhereWithAggregatesInput[]
    OR?: CandidateProfileVersionScalarWhereWithAggregatesInput[]
    NOT?: CandidateProfileVersionScalarWhereWithAggregatesInput | CandidateProfileVersionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CandidateProfileVersion"> | string
    profileId?: StringWithAggregatesFilter<"CandidateProfileVersion"> | string
    versionNumber?: IntWithAggregatesFilter<"CandidateProfileVersion"> | number
    origin?: EnumProfileVersionOriginWithAggregatesFilter<"CandidateProfileVersion"> | $Enums.ProfileVersionOrigin
    parentVersionId?: StringNullableWithAggregatesFilter<"CandidateProfileVersion"> | string | null
    documentId?: StringNullableWithAggregatesFilter<"CandidateProfileVersion"> | string | null
    sourceContentHash?: StringNullableWithAggregatesFilter<"CandidateProfileVersion"> | string | null
    extractorName?: StringWithAggregatesFilter<"CandidateProfileVersion"> | string
    extractorVersion?: StringWithAggregatesFilter<"CandidateProfileVersion"> | string
    content?: JsonWithAggregatesFilter<"CandidateProfileVersion">
    confidence?: JsonNullableWithAggregatesFilter<"CandidateProfileVersion">
    createdAt?: DateTimeWithAggregatesFilter<"CandidateProfileVersion"> | Date | string
  }

  export type TargetJobWhereInput = {
    AND?: TargetJobWhereInput | TargetJobWhereInput[]
    OR?: TargetJobWhereInput[]
    NOT?: TargetJobWhereInput | TargetJobWhereInput[]
    id?: StringFilter<"TargetJob"> | string
    workspaceId?: StringFilter<"TargetJob"> | string
    sourceUrl?: StringFilter<"TargetJob"> | string
    rawText?: StringNullableFilter<"TargetJob"> | string | null
    title?: StringNullableFilter<"TargetJob"> | string | null
    employer?: StringNullableFilter<"TargetJob"> | string | null
    status?: EnumTargetJobStatusFilter<"TargetJob"> | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFilter<"TargetJob"> | Date | string
    createdAt?: DateTimeFilter<"TargetJob"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    tailoredResumes?: TailoredResumeListRelationFilter
  }

  export type TargetJobOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    sourceUrl?: SortOrder
    rawText?: SortOrderInput | SortOrder
    title?: SortOrderInput | SortOrder
    employer?: SortOrderInput | SortOrder
    status?: SortOrder
    fetchedAt?: SortOrder
    createdAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    tailoredResumes?: TailoredResumeOrderByRelationAggregateInput
  }

  export type TargetJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TargetJobWhereInput | TargetJobWhereInput[]
    OR?: TargetJobWhereInput[]
    NOT?: TargetJobWhereInput | TargetJobWhereInput[]
    workspaceId?: StringFilter<"TargetJob"> | string
    sourceUrl?: StringFilter<"TargetJob"> | string
    rawText?: StringNullableFilter<"TargetJob"> | string | null
    title?: StringNullableFilter<"TargetJob"> | string | null
    employer?: StringNullableFilter<"TargetJob"> | string | null
    status?: EnumTargetJobStatusFilter<"TargetJob"> | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFilter<"TargetJob"> | Date | string
    createdAt?: DateTimeFilter<"TargetJob"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    tailoredResumes?: TailoredResumeListRelationFilter
  }, "id">

  export type TargetJobOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    sourceUrl?: SortOrder
    rawText?: SortOrderInput | SortOrder
    title?: SortOrderInput | SortOrder
    employer?: SortOrderInput | SortOrder
    status?: SortOrder
    fetchedAt?: SortOrder
    createdAt?: SortOrder
    _count?: TargetJobCountOrderByAggregateInput
    _max?: TargetJobMaxOrderByAggregateInput
    _min?: TargetJobMinOrderByAggregateInput
  }

  export type TargetJobScalarWhereWithAggregatesInput = {
    AND?: TargetJobScalarWhereWithAggregatesInput | TargetJobScalarWhereWithAggregatesInput[]
    OR?: TargetJobScalarWhereWithAggregatesInput[]
    NOT?: TargetJobScalarWhereWithAggregatesInput | TargetJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"TargetJob"> | string
    workspaceId?: StringWithAggregatesFilter<"TargetJob"> | string
    sourceUrl?: StringWithAggregatesFilter<"TargetJob"> | string
    rawText?: StringNullableWithAggregatesFilter<"TargetJob"> | string | null
    title?: StringNullableWithAggregatesFilter<"TargetJob"> | string | null
    employer?: StringNullableWithAggregatesFilter<"TargetJob"> | string | null
    status?: EnumTargetJobStatusWithAggregatesFilter<"TargetJob"> | $Enums.TargetJobStatus
    fetchedAt?: DateTimeWithAggregatesFilter<"TargetJob"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"TargetJob"> | Date | string
  }

  export type TailoredResumeWhereInput = {
    AND?: TailoredResumeWhereInput | TailoredResumeWhereInput[]
    OR?: TailoredResumeWhereInput[]
    NOT?: TailoredResumeWhereInput | TailoredResumeWhereInput[]
    id?: StringFilter<"TailoredResume"> | string
    workspaceId?: StringFilter<"TailoredResume"> | string
    profileVersionId?: StringFilter<"TailoredResume"> | string
    targetJobId?: StringFilter<"TailoredResume"> | string
    content?: JsonFilter<"TailoredResume">
    templateKey?: StringFilter<"TailoredResume"> | string
    aiJobId?: StringNullableFilter<"TailoredResume"> | string | null
    promptVersion?: StringFilter<"TailoredResume"> | string
    modelVersion?: StringFilter<"TailoredResume"> | string
    degraded?: BoolFilter<"TailoredResume"> | boolean
    createdAt?: DateTimeFilter<"TailoredResume"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    profileVersion?: XOR<CandidateProfileVersionScalarRelationFilter, CandidateProfileVersionWhereInput>
    targetJob?: XOR<TargetJobScalarRelationFilter, TargetJobWhereInput>
  }

  export type TailoredResumeOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    profileVersionId?: SortOrder
    targetJobId?: SortOrder
    content?: SortOrder
    templateKey?: SortOrder
    aiJobId?: SortOrderInput | SortOrder
    promptVersion?: SortOrder
    modelVersion?: SortOrder
    degraded?: SortOrder
    createdAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    profileVersion?: CandidateProfileVersionOrderByWithRelationInput
    targetJob?: TargetJobOrderByWithRelationInput
  }

  export type TailoredResumeWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TailoredResumeWhereInput | TailoredResumeWhereInput[]
    OR?: TailoredResumeWhereInput[]
    NOT?: TailoredResumeWhereInput | TailoredResumeWhereInput[]
    workspaceId?: StringFilter<"TailoredResume"> | string
    profileVersionId?: StringFilter<"TailoredResume"> | string
    targetJobId?: StringFilter<"TailoredResume"> | string
    content?: JsonFilter<"TailoredResume">
    templateKey?: StringFilter<"TailoredResume"> | string
    aiJobId?: StringNullableFilter<"TailoredResume"> | string | null
    promptVersion?: StringFilter<"TailoredResume"> | string
    modelVersion?: StringFilter<"TailoredResume"> | string
    degraded?: BoolFilter<"TailoredResume"> | boolean
    createdAt?: DateTimeFilter<"TailoredResume"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    profileVersion?: XOR<CandidateProfileVersionScalarRelationFilter, CandidateProfileVersionWhereInput>
    targetJob?: XOR<TargetJobScalarRelationFilter, TargetJobWhereInput>
  }, "id">

  export type TailoredResumeOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    profileVersionId?: SortOrder
    targetJobId?: SortOrder
    content?: SortOrder
    templateKey?: SortOrder
    aiJobId?: SortOrderInput | SortOrder
    promptVersion?: SortOrder
    modelVersion?: SortOrder
    degraded?: SortOrder
    createdAt?: SortOrder
    _count?: TailoredResumeCountOrderByAggregateInput
    _max?: TailoredResumeMaxOrderByAggregateInput
    _min?: TailoredResumeMinOrderByAggregateInput
  }

  export type TailoredResumeScalarWhereWithAggregatesInput = {
    AND?: TailoredResumeScalarWhereWithAggregatesInput | TailoredResumeScalarWhereWithAggregatesInput[]
    OR?: TailoredResumeScalarWhereWithAggregatesInput[]
    NOT?: TailoredResumeScalarWhereWithAggregatesInput | TailoredResumeScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"TailoredResume"> | string
    workspaceId?: StringWithAggregatesFilter<"TailoredResume"> | string
    profileVersionId?: StringWithAggregatesFilter<"TailoredResume"> | string
    targetJobId?: StringWithAggregatesFilter<"TailoredResume"> | string
    content?: JsonWithAggregatesFilter<"TailoredResume">
    templateKey?: StringWithAggregatesFilter<"TailoredResume"> | string
    aiJobId?: StringNullableWithAggregatesFilter<"TailoredResume"> | string | null
    promptVersion?: StringWithAggregatesFilter<"TailoredResume"> | string
    modelVersion?: StringWithAggregatesFilter<"TailoredResume"> | string
    degraded?: BoolWithAggregatesFilter<"TailoredResume"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"TailoredResume"> | Date | string
  }

  export type AiUsageLedgerWhereInput = {
    AND?: AiUsageLedgerWhereInput | AiUsageLedgerWhereInput[]
    OR?: AiUsageLedgerWhereInput[]
    NOT?: AiUsageLedgerWhereInput | AiUsageLedgerWhereInput[]
    id?: StringFilter<"AiUsageLedger"> | string
    workspaceId?: StringFilter<"AiUsageLedger"> | string
    kind?: StringFilter<"AiUsageLedger"> | string
    provider?: StringFilter<"AiUsageLedger"> | string
    model?: StringFilter<"AiUsageLedger"> | string
    promptVersion?: StringNullableFilter<"AiUsageLedger"> | string | null
    inputTokens?: IntFilter<"AiUsageLedger"> | number
    outputTokens?: IntFilter<"AiUsageLedger"> | number
    costUsd?: FloatFilter<"AiUsageLedger"> | number
    createdAt?: DateTimeFilter<"AiUsageLedger"> | Date | string
  }

  export type AiUsageLedgerOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    kind?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    promptVersion?: SortOrderInput | SortOrder
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
    createdAt?: SortOrder
  }

  export type AiUsageLedgerWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AiUsageLedgerWhereInput | AiUsageLedgerWhereInput[]
    OR?: AiUsageLedgerWhereInput[]
    NOT?: AiUsageLedgerWhereInput | AiUsageLedgerWhereInput[]
    workspaceId?: StringFilter<"AiUsageLedger"> | string
    kind?: StringFilter<"AiUsageLedger"> | string
    provider?: StringFilter<"AiUsageLedger"> | string
    model?: StringFilter<"AiUsageLedger"> | string
    promptVersion?: StringNullableFilter<"AiUsageLedger"> | string | null
    inputTokens?: IntFilter<"AiUsageLedger"> | number
    outputTokens?: IntFilter<"AiUsageLedger"> | number
    costUsd?: FloatFilter<"AiUsageLedger"> | number
    createdAt?: DateTimeFilter<"AiUsageLedger"> | Date | string
  }, "id">

  export type AiUsageLedgerOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    kind?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    promptVersion?: SortOrderInput | SortOrder
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
    createdAt?: SortOrder
    _count?: AiUsageLedgerCountOrderByAggregateInput
    _avg?: AiUsageLedgerAvgOrderByAggregateInput
    _max?: AiUsageLedgerMaxOrderByAggregateInput
    _min?: AiUsageLedgerMinOrderByAggregateInput
    _sum?: AiUsageLedgerSumOrderByAggregateInput
  }

  export type AiUsageLedgerScalarWhereWithAggregatesInput = {
    AND?: AiUsageLedgerScalarWhereWithAggregatesInput | AiUsageLedgerScalarWhereWithAggregatesInput[]
    OR?: AiUsageLedgerScalarWhereWithAggregatesInput[]
    NOT?: AiUsageLedgerScalarWhereWithAggregatesInput | AiUsageLedgerScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AiUsageLedger"> | string
    workspaceId?: StringWithAggregatesFilter<"AiUsageLedger"> | string
    kind?: StringWithAggregatesFilter<"AiUsageLedger"> | string
    provider?: StringWithAggregatesFilter<"AiUsageLedger"> | string
    model?: StringWithAggregatesFilter<"AiUsageLedger"> | string
    promptVersion?: StringNullableWithAggregatesFilter<"AiUsageLedger"> | string | null
    inputTokens?: IntWithAggregatesFilter<"AiUsageLedger"> | number
    outputTokens?: IntWithAggregatesFilter<"AiUsageLedger"> | number
    costUsd?: FloatWithAggregatesFilter<"AiUsageLedger"> | number
    createdAt?: DateTimeWithAggregatesFilter<"AiUsageLedger"> | Date | string
  }

  export type WorkspaceCreateInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceCreateManyInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventCreateInput = {
    id?: string
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    workspace?: WorkspaceCreateNestedOneWithoutAuditEventsInput
  }

  export type AuditEventUncheckedCreateInput = {
    id?: string
    workspaceId?: string | null
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AuditEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneWithoutAuditEventsNestedInput
  }

  export type AuditEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventCreateManyInput = {
    id?: string
    workspaceId?: string | null
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AuditEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateDocumentCreateInput = {
    id?: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
    workspace: WorkspaceCreateNestedOneWithoutDocumentsInput
    profileVersions?: CandidateProfileVersionCreateNestedManyWithoutDocumentInput
  }

  export type CandidateDocumentUncheckedCreateInput = {
    id?: string
    workspaceId: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
    profileVersions?: CandidateProfileVersionUncheckedCreateNestedManyWithoutDocumentInput
  }

  export type CandidateDocumentUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    workspace?: WorkspaceUpdateOneRequiredWithoutDocumentsNestedInput
    profileVersions?: CandidateProfileVersionUpdateManyWithoutDocumentNestedInput
  }

  export type CandidateDocumentUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    profileVersions?: CandidateProfileVersionUncheckedUpdateManyWithoutDocumentNestedInput
  }

  export type CandidateDocumentCreateManyInput = {
    id?: string
    workspaceId: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
  }

  export type CandidateDocumentUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type CandidateDocumentUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type CandidateProfileCreateInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutProfileInput
    confirmedVersion?: CandidateProfileVersionCreateNestedOneWithoutConfirmedForInput
    versions?: CandidateProfileVersionCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileUncheckedCreateInput = {
    id?: string
    workspaceId: string
    confirmedVersionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    versions?: CandidateProfileVersionUncheckedCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutProfileNestedInput
    confirmedVersion?: CandidateProfileVersionUpdateOneWithoutConfirmedForNestedInput
    versions?: CandidateProfileVersionUpdateManyWithoutProfileNestedInput
  }

  export type CandidateProfileUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    confirmedVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    versions?: CandidateProfileVersionUncheckedUpdateManyWithoutProfileNestedInput
  }

  export type CandidateProfileCreateManyInput = {
    id?: string
    workspaceId: string
    confirmedVersionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CandidateProfileUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    confirmedVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionCreateInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionCreateManyInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type CandidateProfileVersionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TargetJobCreateInput = {
    id?: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutTargetJobsInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutTargetJobInput
  }

  export type TargetJobUncheckedCreateInput = {
    id?: string
    workspaceId: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutTargetJobInput
  }

  export type TargetJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutTargetJobsNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutTargetJobNestedInput
  }

  export type TargetJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutTargetJobNestedInput
  }

  export type TargetJobCreateManyInput = {
    id?: string
    workspaceId: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
  }

  export type TargetJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TargetJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeCreateInput = {
    id?: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutTailoredResumesInput
    profileVersion: CandidateProfileVersionCreateNestedOneWithoutTailoredResumesInput
    targetJob: TargetJobCreateNestedOneWithoutTailoredResumesInput
  }

  export type TailoredResumeUncheckedCreateInput = {
    id?: string
    workspaceId: string
    profileVersionId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutTailoredResumesNestedInput
    profileVersion?: CandidateProfileVersionUpdateOneRequiredWithoutTailoredResumesNestedInput
    targetJob?: TargetJobUpdateOneRequiredWithoutTailoredResumesNestedInput
  }

  export type TailoredResumeUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeCreateManyInput = {
    id?: string
    workspaceId: string
    profileVersionId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AiUsageLedgerCreateInput = {
    id?: string
    workspaceId: string
    kind: string
    provider: string
    model: string
    promptVersion?: string | null
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    createdAt?: Date | string
  }

  export type AiUsageLedgerUncheckedCreateInput = {
    id?: string
    workspaceId: string
    kind: string
    provider: string
    model: string
    promptVersion?: string | null
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    createdAt?: Date | string
  }

  export type AiUsageLedgerUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    promptVersion?: NullableStringFieldUpdateOperationsInput | string | null
    inputTokens?: IntFieldUpdateOperationsInput | number
    outputTokens?: IntFieldUpdateOperationsInput | number
    costUsd?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AiUsageLedgerUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    promptVersion?: NullableStringFieldUpdateOperationsInput | string | null
    inputTokens?: IntFieldUpdateOperationsInput | number
    outputTokens?: IntFieldUpdateOperationsInput | number
    costUsd?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AiUsageLedgerCreateManyInput = {
    id?: string
    workspaceId: string
    kind: string
    provider: string
    model: string
    promptVersion?: string | null
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    createdAt?: Date | string
  }

  export type AiUsageLedgerUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    promptVersion?: NullableStringFieldUpdateOperationsInput | string | null
    inputTokens?: IntFieldUpdateOperationsInput | number
    outputTokens?: IntFieldUpdateOperationsInput | number
    costUsd?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AiUsageLedgerUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    model?: StringFieldUpdateOperationsInput | string
    promptVersion?: NullableStringFieldUpdateOperationsInput | string | null
    inputTokens?: IntFieldUpdateOperationsInput | number
    outputTokens?: IntFieldUpdateOperationsInput | number
    costUsd?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type AuditEventListRelationFilter = {
    every?: AuditEventWhereInput
    some?: AuditEventWhereInput
    none?: AuditEventWhereInput
  }

  export type CandidateDocumentListRelationFilter = {
    every?: CandidateDocumentWhereInput
    some?: CandidateDocumentWhereInput
    none?: CandidateDocumentWhereInput
  }

  export type CandidateProfileNullableScalarRelationFilter = {
    is?: CandidateProfileWhereInput | null
    isNot?: CandidateProfileWhereInput | null
  }

  export type TargetJobListRelationFilter = {
    every?: TargetJobWhereInput
    some?: TargetJobWhereInput
    none?: TargetJobWhereInput
  }

  export type TailoredResumeListRelationFilter = {
    every?: TailoredResumeWhereInput
    some?: TailoredResumeWhereInput
    none?: TailoredResumeWhereInput
  }

  export type AuditEventOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CandidateDocumentOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TargetJobOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TailoredResumeOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WorkspaceCountOrderByAggregateInput = {
    id?: SortOrder
    platformUserId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceMaxOrderByAggregateInput = {
    id?: SortOrder
    platformUserId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceMinOrderByAggregateInput = {
    id?: SortOrder
    platformUserId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type WorkspaceNullableScalarRelationFilter = {
    is?: WorkspaceWhereInput | null
    isNot?: WorkspaceWhereInput | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type AuditEventCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    action?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditEventMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    action?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditEventMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    action?: SortOrder
    createdAt?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type EnumDocumentStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentStatus | EnumDocumentStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDocumentStatusFilter<$PrismaModel> | $Enums.DocumentStatus
  }

  export type EnumDocumentReasonCodeNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentReasonCode | EnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel> | $Enums.DocumentReasonCode | null
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type WorkspaceScalarRelationFilter = {
    is?: WorkspaceWhereInput
    isNot?: WorkspaceWhereInput
  }

  export type CandidateProfileVersionListRelationFilter = {
    every?: CandidateProfileVersionWhereInput
    some?: CandidateProfileVersionWhereInput
    none?: CandidateProfileVersionWhereInput
  }

  export type CandidateProfileVersionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CandidateDocumentCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    storageKey?: SortOrder
    originalFilename?: SortOrder
    contentType?: SortOrder
    byteSize?: SortOrder
    contentHash?: SortOrder
    status?: SortOrder
    reasonCode?: SortOrder
    scannerName?: SortOrder
    scannedAt?: SortOrder
    extractionAttempts?: SortOrder
    extractionStartedAt?: SortOrder
    retainUntil?: SortOrder
    uploadedAt?: SortOrder
    deletedAt?: SortOrder
  }

  export type CandidateDocumentAvgOrderByAggregateInput = {
    byteSize?: SortOrder
    extractionAttempts?: SortOrder
  }

  export type CandidateDocumentMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    storageKey?: SortOrder
    originalFilename?: SortOrder
    contentType?: SortOrder
    byteSize?: SortOrder
    contentHash?: SortOrder
    status?: SortOrder
    reasonCode?: SortOrder
    scannerName?: SortOrder
    scannedAt?: SortOrder
    extractionAttempts?: SortOrder
    extractionStartedAt?: SortOrder
    retainUntil?: SortOrder
    uploadedAt?: SortOrder
    deletedAt?: SortOrder
  }

  export type CandidateDocumentMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    storageKey?: SortOrder
    originalFilename?: SortOrder
    contentType?: SortOrder
    byteSize?: SortOrder
    contentHash?: SortOrder
    status?: SortOrder
    reasonCode?: SortOrder
    scannerName?: SortOrder
    scannedAt?: SortOrder
    extractionAttempts?: SortOrder
    extractionStartedAt?: SortOrder
    retainUntil?: SortOrder
    uploadedAt?: SortOrder
    deletedAt?: SortOrder
  }

  export type CandidateDocumentSumOrderByAggregateInput = {
    byteSize?: SortOrder
    extractionAttempts?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type EnumDocumentStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentStatus | EnumDocumentStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDocumentStatusWithAggregatesFilter<$PrismaModel> | $Enums.DocumentStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDocumentStatusFilter<$PrismaModel>
    _max?: NestedEnumDocumentStatusFilter<$PrismaModel>
  }

  export type EnumDocumentReasonCodeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentReasonCode | EnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDocumentReasonCodeNullableWithAggregatesFilter<$PrismaModel> | $Enums.DocumentReasonCode | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel>
    _max?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type CandidateProfileVersionNullableScalarRelationFilter = {
    is?: CandidateProfileVersionWhereInput | null
    isNot?: CandidateProfileVersionWhereInput | null
  }

  export type CandidateProfileCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    confirmedVersionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CandidateProfileMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    confirmedVersionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CandidateProfileMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    confirmedVersionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumProfileVersionOriginFilter<$PrismaModel = never> = {
    equals?: $Enums.ProfileVersionOrigin | EnumProfileVersionOriginFieldRefInput<$PrismaModel>
    in?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    notIn?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    not?: NestedEnumProfileVersionOriginFilter<$PrismaModel> | $Enums.ProfileVersionOrigin
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type CandidateProfileScalarRelationFilter = {
    is?: CandidateProfileWhereInput
    isNot?: CandidateProfileWhereInput
  }

  export type CandidateDocumentNullableScalarRelationFilter = {
    is?: CandidateDocumentWhereInput | null
    isNot?: CandidateDocumentWhereInput | null
  }

  export type CandidateProfileVersionProfileIdVersionNumberCompoundUniqueInput = {
    profileId: string
    versionNumber: number
  }

  export type CandidateProfileVersionCountOrderByAggregateInput = {
    id?: SortOrder
    profileId?: SortOrder
    versionNumber?: SortOrder
    origin?: SortOrder
    parentVersionId?: SortOrder
    documentId?: SortOrder
    sourceContentHash?: SortOrder
    extractorName?: SortOrder
    extractorVersion?: SortOrder
    content?: SortOrder
    confidence?: SortOrder
    createdAt?: SortOrder
  }

  export type CandidateProfileVersionAvgOrderByAggregateInput = {
    versionNumber?: SortOrder
  }

  export type CandidateProfileVersionMaxOrderByAggregateInput = {
    id?: SortOrder
    profileId?: SortOrder
    versionNumber?: SortOrder
    origin?: SortOrder
    parentVersionId?: SortOrder
    documentId?: SortOrder
    sourceContentHash?: SortOrder
    extractorName?: SortOrder
    extractorVersion?: SortOrder
    createdAt?: SortOrder
  }

  export type CandidateProfileVersionMinOrderByAggregateInput = {
    id?: SortOrder
    profileId?: SortOrder
    versionNumber?: SortOrder
    origin?: SortOrder
    parentVersionId?: SortOrder
    documentId?: SortOrder
    sourceContentHash?: SortOrder
    extractorName?: SortOrder
    extractorVersion?: SortOrder
    createdAt?: SortOrder
  }

  export type CandidateProfileVersionSumOrderByAggregateInput = {
    versionNumber?: SortOrder
  }

  export type EnumProfileVersionOriginWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ProfileVersionOrigin | EnumProfileVersionOriginFieldRefInput<$PrismaModel>
    in?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    notIn?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    not?: NestedEnumProfileVersionOriginWithAggregatesFilter<$PrismaModel> | $Enums.ProfileVersionOrigin
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumProfileVersionOriginFilter<$PrismaModel>
    _max?: NestedEnumProfileVersionOriginFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type EnumTargetJobStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TargetJobStatus | EnumTargetJobStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTargetJobStatusFilter<$PrismaModel> | $Enums.TargetJobStatus
  }

  export type TargetJobCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    sourceUrl?: SortOrder
    rawText?: SortOrder
    title?: SortOrder
    employer?: SortOrder
    status?: SortOrder
    fetchedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type TargetJobMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    sourceUrl?: SortOrder
    rawText?: SortOrder
    title?: SortOrder
    employer?: SortOrder
    status?: SortOrder
    fetchedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type TargetJobMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    sourceUrl?: SortOrder
    rawText?: SortOrder
    title?: SortOrder
    employer?: SortOrder
    status?: SortOrder
    fetchedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type EnumTargetJobStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TargetJobStatus | EnumTargetJobStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTargetJobStatusWithAggregatesFilter<$PrismaModel> | $Enums.TargetJobStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTargetJobStatusFilter<$PrismaModel>
    _max?: NestedEnumTargetJobStatusFilter<$PrismaModel>
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type CandidateProfileVersionScalarRelationFilter = {
    is?: CandidateProfileVersionWhereInput
    isNot?: CandidateProfileVersionWhereInput
  }

  export type TargetJobScalarRelationFilter = {
    is?: TargetJobWhereInput
    isNot?: TargetJobWhereInput
  }

  export type TailoredResumeCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    profileVersionId?: SortOrder
    targetJobId?: SortOrder
    content?: SortOrder
    templateKey?: SortOrder
    aiJobId?: SortOrder
    promptVersion?: SortOrder
    modelVersion?: SortOrder
    degraded?: SortOrder
    createdAt?: SortOrder
  }

  export type TailoredResumeMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    profileVersionId?: SortOrder
    targetJobId?: SortOrder
    templateKey?: SortOrder
    aiJobId?: SortOrder
    promptVersion?: SortOrder
    modelVersion?: SortOrder
    degraded?: SortOrder
    createdAt?: SortOrder
  }

  export type TailoredResumeMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    profileVersionId?: SortOrder
    targetJobId?: SortOrder
    templateKey?: SortOrder
    aiJobId?: SortOrder
    promptVersion?: SortOrder
    modelVersion?: SortOrder
    degraded?: SortOrder
    createdAt?: SortOrder
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type AiUsageLedgerCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    kind?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    promptVersion?: SortOrder
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
    createdAt?: SortOrder
  }

  export type AiUsageLedgerAvgOrderByAggregateInput = {
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
  }

  export type AiUsageLedgerMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    kind?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    promptVersion?: SortOrder
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
    createdAt?: SortOrder
  }

  export type AiUsageLedgerMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    kind?: SortOrder
    provider?: SortOrder
    model?: SortOrder
    promptVersion?: SortOrder
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
    createdAt?: SortOrder
  }

  export type AiUsageLedgerSumOrderByAggregateInput = {
    inputTokens?: SortOrder
    outputTokens?: SortOrder
    costUsd?: SortOrder
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type AuditEventCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput> | AuditEventCreateWithoutWorkspaceInput[] | AuditEventUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutWorkspaceInput | AuditEventCreateOrConnectWithoutWorkspaceInput[]
    createMany?: AuditEventCreateManyWorkspaceInputEnvelope
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
  }

  export type CandidateDocumentCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput> | CandidateDocumentCreateWithoutWorkspaceInput[] | CandidateDocumentUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutWorkspaceInput | CandidateDocumentCreateOrConnectWithoutWorkspaceInput[]
    createMany?: CandidateDocumentCreateManyWorkspaceInputEnvelope
    connect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
  }

  export type CandidateProfileCreateNestedOneWithoutWorkspaceInput = {
    create?: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutWorkspaceInput
    connect?: CandidateProfileWhereUniqueInput
  }

  export type TargetJobCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput> | TargetJobCreateWithoutWorkspaceInput[] | TargetJobUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TargetJobCreateOrConnectWithoutWorkspaceInput | TargetJobCreateOrConnectWithoutWorkspaceInput[]
    createMany?: TargetJobCreateManyWorkspaceInputEnvelope
    connect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
  }

  export type TailoredResumeCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput> | TailoredResumeCreateWithoutWorkspaceInput[] | TailoredResumeUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutWorkspaceInput | TailoredResumeCreateOrConnectWithoutWorkspaceInput[]
    createMany?: TailoredResumeCreateManyWorkspaceInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput> | AuditEventCreateWithoutWorkspaceInput[] | AuditEventUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutWorkspaceInput | AuditEventCreateOrConnectWithoutWorkspaceInput[]
    createMany?: AuditEventCreateManyWorkspaceInputEnvelope
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
  }

  export type CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput> | CandidateDocumentCreateWithoutWorkspaceInput[] | CandidateDocumentUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutWorkspaceInput | CandidateDocumentCreateOrConnectWithoutWorkspaceInput[]
    createMany?: CandidateDocumentCreateManyWorkspaceInputEnvelope
    connect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
  }

  export type CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput = {
    create?: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutWorkspaceInput
    connect?: CandidateProfileWhereUniqueInput
  }

  export type TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput> | TargetJobCreateWithoutWorkspaceInput[] | TargetJobUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TargetJobCreateOrConnectWithoutWorkspaceInput | TargetJobCreateOrConnectWithoutWorkspaceInput[]
    createMany?: TargetJobCreateManyWorkspaceInputEnvelope
    connect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
  }

  export type TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput> | TailoredResumeCreateWithoutWorkspaceInput[] | TailoredResumeUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutWorkspaceInput | TailoredResumeCreateOrConnectWithoutWorkspaceInput[]
    createMany?: TailoredResumeCreateManyWorkspaceInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type AuditEventUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput> | AuditEventCreateWithoutWorkspaceInput[] | AuditEventUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutWorkspaceInput | AuditEventCreateOrConnectWithoutWorkspaceInput[]
    upsert?: AuditEventUpsertWithWhereUniqueWithoutWorkspaceInput | AuditEventUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: AuditEventCreateManyWorkspaceInputEnvelope
    set?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    disconnect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    delete?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    update?: AuditEventUpdateWithWhereUniqueWithoutWorkspaceInput | AuditEventUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: AuditEventUpdateManyWithWhereWithoutWorkspaceInput | AuditEventUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
  }

  export type CandidateDocumentUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput> | CandidateDocumentCreateWithoutWorkspaceInput[] | CandidateDocumentUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutWorkspaceInput | CandidateDocumentCreateOrConnectWithoutWorkspaceInput[]
    upsert?: CandidateDocumentUpsertWithWhereUniqueWithoutWorkspaceInput | CandidateDocumentUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: CandidateDocumentCreateManyWorkspaceInputEnvelope
    set?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    disconnect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    delete?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    connect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    update?: CandidateDocumentUpdateWithWhereUniqueWithoutWorkspaceInput | CandidateDocumentUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: CandidateDocumentUpdateManyWithWhereWithoutWorkspaceInput | CandidateDocumentUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: CandidateDocumentScalarWhereInput | CandidateDocumentScalarWhereInput[]
  }

  export type CandidateProfileUpdateOneWithoutWorkspaceNestedInput = {
    create?: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutWorkspaceInput
    upsert?: CandidateProfileUpsertWithoutWorkspaceInput
    disconnect?: CandidateProfileWhereInput | boolean
    delete?: CandidateProfileWhereInput | boolean
    connect?: CandidateProfileWhereUniqueInput
    update?: XOR<XOR<CandidateProfileUpdateToOneWithWhereWithoutWorkspaceInput, CandidateProfileUpdateWithoutWorkspaceInput>, CandidateProfileUncheckedUpdateWithoutWorkspaceInput>
  }

  export type TargetJobUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput> | TargetJobCreateWithoutWorkspaceInput[] | TargetJobUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TargetJobCreateOrConnectWithoutWorkspaceInput | TargetJobCreateOrConnectWithoutWorkspaceInput[]
    upsert?: TargetJobUpsertWithWhereUniqueWithoutWorkspaceInput | TargetJobUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: TargetJobCreateManyWorkspaceInputEnvelope
    set?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    disconnect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    delete?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    connect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    update?: TargetJobUpdateWithWhereUniqueWithoutWorkspaceInput | TargetJobUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: TargetJobUpdateManyWithWhereWithoutWorkspaceInput | TargetJobUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: TargetJobScalarWhereInput | TargetJobScalarWhereInput[]
  }

  export type TailoredResumeUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput> | TailoredResumeCreateWithoutWorkspaceInput[] | TailoredResumeUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutWorkspaceInput | TailoredResumeCreateOrConnectWithoutWorkspaceInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutWorkspaceInput | TailoredResumeUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: TailoredResumeCreateManyWorkspaceInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutWorkspaceInput | TailoredResumeUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutWorkspaceInput | TailoredResumeUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput> | AuditEventCreateWithoutWorkspaceInput[] | AuditEventUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutWorkspaceInput | AuditEventCreateOrConnectWithoutWorkspaceInput[]
    upsert?: AuditEventUpsertWithWhereUniqueWithoutWorkspaceInput | AuditEventUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: AuditEventCreateManyWorkspaceInputEnvelope
    set?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    disconnect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    delete?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    update?: AuditEventUpdateWithWhereUniqueWithoutWorkspaceInput | AuditEventUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: AuditEventUpdateManyWithWhereWithoutWorkspaceInput | AuditEventUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
  }

  export type CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput> | CandidateDocumentCreateWithoutWorkspaceInput[] | CandidateDocumentUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutWorkspaceInput | CandidateDocumentCreateOrConnectWithoutWorkspaceInput[]
    upsert?: CandidateDocumentUpsertWithWhereUniqueWithoutWorkspaceInput | CandidateDocumentUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: CandidateDocumentCreateManyWorkspaceInputEnvelope
    set?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    disconnect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    delete?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    connect?: CandidateDocumentWhereUniqueInput | CandidateDocumentWhereUniqueInput[]
    update?: CandidateDocumentUpdateWithWhereUniqueWithoutWorkspaceInput | CandidateDocumentUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: CandidateDocumentUpdateManyWithWhereWithoutWorkspaceInput | CandidateDocumentUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: CandidateDocumentScalarWhereInput | CandidateDocumentScalarWhereInput[]
  }

  export type CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput = {
    create?: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutWorkspaceInput
    upsert?: CandidateProfileUpsertWithoutWorkspaceInput
    disconnect?: CandidateProfileWhereInput | boolean
    delete?: CandidateProfileWhereInput | boolean
    connect?: CandidateProfileWhereUniqueInput
    update?: XOR<XOR<CandidateProfileUpdateToOneWithWhereWithoutWorkspaceInput, CandidateProfileUpdateWithoutWorkspaceInput>, CandidateProfileUncheckedUpdateWithoutWorkspaceInput>
  }

  export type TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput> | TargetJobCreateWithoutWorkspaceInput[] | TargetJobUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TargetJobCreateOrConnectWithoutWorkspaceInput | TargetJobCreateOrConnectWithoutWorkspaceInput[]
    upsert?: TargetJobUpsertWithWhereUniqueWithoutWorkspaceInput | TargetJobUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: TargetJobCreateManyWorkspaceInputEnvelope
    set?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    disconnect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    delete?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    connect?: TargetJobWhereUniqueInput | TargetJobWhereUniqueInput[]
    update?: TargetJobUpdateWithWhereUniqueWithoutWorkspaceInput | TargetJobUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: TargetJobUpdateManyWithWhereWithoutWorkspaceInput | TargetJobUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: TargetJobScalarWhereInput | TargetJobScalarWhereInput[]
  }

  export type TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput> | TailoredResumeCreateWithoutWorkspaceInput[] | TailoredResumeUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutWorkspaceInput | TailoredResumeCreateOrConnectWithoutWorkspaceInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutWorkspaceInput | TailoredResumeUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: TailoredResumeCreateManyWorkspaceInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutWorkspaceInput | TailoredResumeUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutWorkspaceInput | TailoredResumeUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutAuditEventsInput = {
    create?: XOR<WorkspaceCreateWithoutAuditEventsInput, WorkspaceUncheckedCreateWithoutAuditEventsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutAuditEventsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type WorkspaceUpdateOneWithoutAuditEventsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutAuditEventsInput, WorkspaceUncheckedCreateWithoutAuditEventsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutAuditEventsInput
    upsert?: WorkspaceUpsertWithoutAuditEventsInput
    disconnect?: WorkspaceWhereInput | boolean
    delete?: WorkspaceWhereInput | boolean
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutAuditEventsInput, WorkspaceUpdateWithoutAuditEventsInput>, WorkspaceUncheckedUpdateWithoutAuditEventsInput>
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type WorkspaceCreateNestedOneWithoutDocumentsInput = {
    create?: XOR<WorkspaceCreateWithoutDocumentsInput, WorkspaceUncheckedCreateWithoutDocumentsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutDocumentsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedManyWithoutDocumentInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput> | CandidateProfileVersionCreateWithoutDocumentInput[] | CandidateProfileVersionUncheckedCreateWithoutDocumentInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutDocumentInput | CandidateProfileVersionCreateOrConnectWithoutDocumentInput[]
    createMany?: CandidateProfileVersionCreateManyDocumentInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type CandidateProfileVersionUncheckedCreateNestedManyWithoutDocumentInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput> | CandidateProfileVersionCreateWithoutDocumentInput[] | CandidateProfileVersionUncheckedCreateWithoutDocumentInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutDocumentInput | CandidateProfileVersionCreateOrConnectWithoutDocumentInput[]
    createMany?: CandidateProfileVersionCreateManyDocumentInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type EnumDocumentStatusFieldUpdateOperationsInput = {
    set?: $Enums.DocumentStatus
  }

  export type NullableEnumDocumentReasonCodeFieldUpdateOperationsInput = {
    set?: $Enums.DocumentReasonCode | null
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type WorkspaceUpdateOneRequiredWithoutDocumentsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutDocumentsInput, WorkspaceUncheckedCreateWithoutDocumentsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutDocumentsInput
    upsert?: WorkspaceUpsertWithoutDocumentsInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutDocumentsInput, WorkspaceUpdateWithoutDocumentsInput>, WorkspaceUncheckedUpdateWithoutDocumentsInput>
  }

  export type CandidateProfileVersionUpdateManyWithoutDocumentNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput> | CandidateProfileVersionCreateWithoutDocumentInput[] | CandidateProfileVersionUncheckedCreateWithoutDocumentInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutDocumentInput | CandidateProfileVersionCreateOrConnectWithoutDocumentInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutDocumentInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutDocumentInput[]
    createMany?: CandidateProfileVersionCreateManyDocumentInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutDocumentInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutDocumentInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutDocumentInput | CandidateProfileVersionUpdateManyWithWhereWithoutDocumentInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutDocumentNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput> | CandidateProfileVersionCreateWithoutDocumentInput[] | CandidateProfileVersionUncheckedCreateWithoutDocumentInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutDocumentInput | CandidateProfileVersionCreateOrConnectWithoutDocumentInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutDocumentInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutDocumentInput[]
    createMany?: CandidateProfileVersionCreateManyDocumentInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutDocumentInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutDocumentInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutDocumentInput | CandidateProfileVersionUpdateManyWithWhereWithoutDocumentInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutProfileInput = {
    create?: XOR<WorkspaceCreateWithoutProfileInput, WorkspaceUncheckedCreateWithoutProfileInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutProfileInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedOneWithoutConfirmedForInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutConfirmedForInput, CandidateProfileVersionUncheckedCreateWithoutConfirmedForInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutConfirmedForInput
    connect?: CandidateProfileVersionWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedManyWithoutProfileInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput> | CandidateProfileVersionCreateWithoutProfileInput[] | CandidateProfileVersionUncheckedCreateWithoutProfileInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutProfileInput | CandidateProfileVersionCreateOrConnectWithoutProfileInput[]
    createMany?: CandidateProfileVersionCreateManyProfileInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type CandidateProfileVersionUncheckedCreateNestedManyWithoutProfileInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput> | CandidateProfileVersionCreateWithoutProfileInput[] | CandidateProfileVersionUncheckedCreateWithoutProfileInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutProfileInput | CandidateProfileVersionCreateOrConnectWithoutProfileInput[]
    createMany?: CandidateProfileVersionCreateManyProfileInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type WorkspaceUpdateOneRequiredWithoutProfileNestedInput = {
    create?: XOR<WorkspaceCreateWithoutProfileInput, WorkspaceUncheckedCreateWithoutProfileInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutProfileInput
    upsert?: WorkspaceUpsertWithoutProfileInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutProfileInput, WorkspaceUpdateWithoutProfileInput>, WorkspaceUncheckedUpdateWithoutProfileInput>
  }

  export type CandidateProfileVersionUpdateOneWithoutConfirmedForNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutConfirmedForInput, CandidateProfileVersionUncheckedCreateWithoutConfirmedForInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutConfirmedForInput
    upsert?: CandidateProfileVersionUpsertWithoutConfirmedForInput
    disconnect?: CandidateProfileVersionWhereInput | boolean
    delete?: CandidateProfileVersionWhereInput | boolean
    connect?: CandidateProfileVersionWhereUniqueInput
    update?: XOR<XOR<CandidateProfileVersionUpdateToOneWithWhereWithoutConfirmedForInput, CandidateProfileVersionUpdateWithoutConfirmedForInput>, CandidateProfileVersionUncheckedUpdateWithoutConfirmedForInput>
  }

  export type CandidateProfileVersionUpdateManyWithoutProfileNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput> | CandidateProfileVersionCreateWithoutProfileInput[] | CandidateProfileVersionUncheckedCreateWithoutProfileInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutProfileInput | CandidateProfileVersionCreateOrConnectWithoutProfileInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutProfileInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutProfileInput[]
    createMany?: CandidateProfileVersionCreateManyProfileInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutProfileInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutProfileInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutProfileInput | CandidateProfileVersionUpdateManyWithWhereWithoutProfileInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutProfileNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput> | CandidateProfileVersionCreateWithoutProfileInput[] | CandidateProfileVersionUncheckedCreateWithoutProfileInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutProfileInput | CandidateProfileVersionCreateOrConnectWithoutProfileInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutProfileInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutProfileInput[]
    createMany?: CandidateProfileVersionCreateManyProfileInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutProfileInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutProfileInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutProfileInput | CandidateProfileVersionUpdateManyWithWhereWithoutProfileInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type CandidateProfileCreateNestedOneWithoutVersionsInput = {
    create?: XOR<CandidateProfileCreateWithoutVersionsInput, CandidateProfileUncheckedCreateWithoutVersionsInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutVersionsInput
    connect?: CandidateProfileWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedOneWithoutChildrenInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutChildrenInput, CandidateProfileVersionUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutChildrenInput
    connect?: CandidateProfileVersionWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedManyWithoutParentVersionInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput> | CandidateProfileVersionCreateWithoutParentVersionInput[] | CandidateProfileVersionUncheckedCreateWithoutParentVersionInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutParentVersionInput | CandidateProfileVersionCreateOrConnectWithoutParentVersionInput[]
    createMany?: CandidateProfileVersionCreateManyParentVersionInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type CandidateDocumentCreateNestedOneWithoutProfileVersionsInput = {
    create?: XOR<CandidateDocumentCreateWithoutProfileVersionsInput, CandidateDocumentUncheckedCreateWithoutProfileVersionsInput>
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutProfileVersionsInput
    connect?: CandidateDocumentWhereUniqueInput
  }

  export type CandidateProfileCreateNestedOneWithoutConfirmedVersionInput = {
    create?: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutConfirmedVersionInput
    connect?: CandidateProfileWhereUniqueInput
  }

  export type TailoredResumeCreateNestedManyWithoutProfileVersionInput = {
    create?: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput> | TailoredResumeCreateWithoutProfileVersionInput[] | TailoredResumeUncheckedCreateWithoutProfileVersionInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutProfileVersionInput | TailoredResumeCreateOrConnectWithoutProfileVersionInput[]
    createMany?: TailoredResumeCreateManyProfileVersionInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput> | CandidateProfileVersionCreateWithoutParentVersionInput[] | CandidateProfileVersionUncheckedCreateWithoutParentVersionInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutParentVersionInput | CandidateProfileVersionCreateOrConnectWithoutParentVersionInput[]
    createMany?: CandidateProfileVersionCreateManyParentVersionInputEnvelope
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
  }

  export type CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput = {
    create?: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutConfirmedVersionInput
    connect?: CandidateProfileWhereUniqueInput
  }

  export type TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput = {
    create?: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput> | TailoredResumeCreateWithoutProfileVersionInput[] | TailoredResumeUncheckedCreateWithoutProfileVersionInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutProfileVersionInput | TailoredResumeCreateOrConnectWithoutProfileVersionInput[]
    createMany?: TailoredResumeCreateManyProfileVersionInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type EnumProfileVersionOriginFieldUpdateOperationsInput = {
    set?: $Enums.ProfileVersionOrigin
  }

  export type CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput = {
    create?: XOR<CandidateProfileCreateWithoutVersionsInput, CandidateProfileUncheckedCreateWithoutVersionsInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutVersionsInput
    upsert?: CandidateProfileUpsertWithoutVersionsInput
    connect?: CandidateProfileWhereUniqueInput
    update?: XOR<XOR<CandidateProfileUpdateToOneWithWhereWithoutVersionsInput, CandidateProfileUpdateWithoutVersionsInput>, CandidateProfileUncheckedUpdateWithoutVersionsInput>
  }

  export type CandidateProfileVersionUpdateOneWithoutChildrenNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutChildrenInput, CandidateProfileVersionUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutChildrenInput
    upsert?: CandidateProfileVersionUpsertWithoutChildrenInput
    disconnect?: CandidateProfileVersionWhereInput | boolean
    delete?: CandidateProfileVersionWhereInput | boolean
    connect?: CandidateProfileVersionWhereUniqueInput
    update?: XOR<XOR<CandidateProfileVersionUpdateToOneWithWhereWithoutChildrenInput, CandidateProfileVersionUpdateWithoutChildrenInput>, CandidateProfileVersionUncheckedUpdateWithoutChildrenInput>
  }

  export type CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput> | CandidateProfileVersionCreateWithoutParentVersionInput[] | CandidateProfileVersionUncheckedCreateWithoutParentVersionInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutParentVersionInput | CandidateProfileVersionCreateOrConnectWithoutParentVersionInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutParentVersionInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutParentVersionInput[]
    createMany?: CandidateProfileVersionCreateManyParentVersionInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutParentVersionInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutParentVersionInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutParentVersionInput | CandidateProfileVersionUpdateManyWithWhereWithoutParentVersionInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput = {
    create?: XOR<CandidateDocumentCreateWithoutProfileVersionsInput, CandidateDocumentUncheckedCreateWithoutProfileVersionsInput>
    connectOrCreate?: CandidateDocumentCreateOrConnectWithoutProfileVersionsInput
    upsert?: CandidateDocumentUpsertWithoutProfileVersionsInput
    disconnect?: CandidateDocumentWhereInput | boolean
    delete?: CandidateDocumentWhereInput | boolean
    connect?: CandidateDocumentWhereUniqueInput
    update?: XOR<XOR<CandidateDocumentUpdateToOneWithWhereWithoutProfileVersionsInput, CandidateDocumentUpdateWithoutProfileVersionsInput>, CandidateDocumentUncheckedUpdateWithoutProfileVersionsInput>
  }

  export type CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput = {
    create?: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutConfirmedVersionInput
    upsert?: CandidateProfileUpsertWithoutConfirmedVersionInput
    disconnect?: CandidateProfileWhereInput | boolean
    delete?: CandidateProfileWhereInput | boolean
    connect?: CandidateProfileWhereUniqueInput
    update?: XOR<XOR<CandidateProfileUpdateToOneWithWhereWithoutConfirmedVersionInput, CandidateProfileUpdateWithoutConfirmedVersionInput>, CandidateProfileUncheckedUpdateWithoutConfirmedVersionInput>
  }

  export type TailoredResumeUpdateManyWithoutProfileVersionNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput> | TailoredResumeCreateWithoutProfileVersionInput[] | TailoredResumeUncheckedCreateWithoutProfileVersionInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutProfileVersionInput | TailoredResumeCreateOrConnectWithoutProfileVersionInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutProfileVersionInput | TailoredResumeUpsertWithWhereUniqueWithoutProfileVersionInput[]
    createMany?: TailoredResumeCreateManyProfileVersionInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutProfileVersionInput | TailoredResumeUpdateWithWhereUniqueWithoutProfileVersionInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutProfileVersionInput | TailoredResumeUpdateManyWithWhereWithoutProfileVersionInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput> | CandidateProfileVersionCreateWithoutParentVersionInput[] | CandidateProfileVersionUncheckedCreateWithoutParentVersionInput[]
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutParentVersionInput | CandidateProfileVersionCreateOrConnectWithoutParentVersionInput[]
    upsert?: CandidateProfileVersionUpsertWithWhereUniqueWithoutParentVersionInput | CandidateProfileVersionUpsertWithWhereUniqueWithoutParentVersionInput[]
    createMany?: CandidateProfileVersionCreateManyParentVersionInputEnvelope
    set?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    disconnect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    delete?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    connect?: CandidateProfileVersionWhereUniqueInput | CandidateProfileVersionWhereUniqueInput[]
    update?: CandidateProfileVersionUpdateWithWhereUniqueWithoutParentVersionInput | CandidateProfileVersionUpdateWithWhereUniqueWithoutParentVersionInput[]
    updateMany?: CandidateProfileVersionUpdateManyWithWhereWithoutParentVersionInput | CandidateProfileVersionUpdateManyWithWhereWithoutParentVersionInput[]
    deleteMany?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
  }

  export type CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput = {
    create?: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
    connectOrCreate?: CandidateProfileCreateOrConnectWithoutConfirmedVersionInput
    upsert?: CandidateProfileUpsertWithoutConfirmedVersionInput
    disconnect?: CandidateProfileWhereInput | boolean
    delete?: CandidateProfileWhereInput | boolean
    connect?: CandidateProfileWhereUniqueInput
    update?: XOR<XOR<CandidateProfileUpdateToOneWithWhereWithoutConfirmedVersionInput, CandidateProfileUpdateWithoutConfirmedVersionInput>, CandidateProfileUncheckedUpdateWithoutConfirmedVersionInput>
  }

  export type TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput> | TailoredResumeCreateWithoutProfileVersionInput[] | TailoredResumeUncheckedCreateWithoutProfileVersionInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutProfileVersionInput | TailoredResumeCreateOrConnectWithoutProfileVersionInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutProfileVersionInput | TailoredResumeUpsertWithWhereUniqueWithoutProfileVersionInput[]
    createMany?: TailoredResumeCreateManyProfileVersionInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutProfileVersionInput | TailoredResumeUpdateWithWhereUniqueWithoutProfileVersionInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutProfileVersionInput | TailoredResumeUpdateManyWithWhereWithoutProfileVersionInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutTargetJobsInput = {
    create?: XOR<WorkspaceCreateWithoutTargetJobsInput, WorkspaceUncheckedCreateWithoutTargetJobsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTargetJobsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type TailoredResumeCreateNestedManyWithoutTargetJobInput = {
    create?: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput> | TailoredResumeCreateWithoutTargetJobInput[] | TailoredResumeUncheckedCreateWithoutTargetJobInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutTargetJobInput | TailoredResumeCreateOrConnectWithoutTargetJobInput[]
    createMany?: TailoredResumeCreateManyTargetJobInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type TailoredResumeUncheckedCreateNestedManyWithoutTargetJobInput = {
    create?: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput> | TailoredResumeCreateWithoutTargetJobInput[] | TailoredResumeUncheckedCreateWithoutTargetJobInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutTargetJobInput | TailoredResumeCreateOrConnectWithoutTargetJobInput[]
    createMany?: TailoredResumeCreateManyTargetJobInputEnvelope
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
  }

  export type EnumTargetJobStatusFieldUpdateOperationsInput = {
    set?: $Enums.TargetJobStatus
  }

  export type WorkspaceUpdateOneRequiredWithoutTargetJobsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutTargetJobsInput, WorkspaceUncheckedCreateWithoutTargetJobsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTargetJobsInput
    upsert?: WorkspaceUpsertWithoutTargetJobsInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutTargetJobsInput, WorkspaceUpdateWithoutTargetJobsInput>, WorkspaceUncheckedUpdateWithoutTargetJobsInput>
  }

  export type TailoredResumeUpdateManyWithoutTargetJobNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput> | TailoredResumeCreateWithoutTargetJobInput[] | TailoredResumeUncheckedCreateWithoutTargetJobInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutTargetJobInput | TailoredResumeCreateOrConnectWithoutTargetJobInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutTargetJobInput | TailoredResumeUpsertWithWhereUniqueWithoutTargetJobInput[]
    createMany?: TailoredResumeCreateManyTargetJobInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutTargetJobInput | TailoredResumeUpdateWithWhereUniqueWithoutTargetJobInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutTargetJobInput | TailoredResumeUpdateManyWithWhereWithoutTargetJobInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type TailoredResumeUncheckedUpdateManyWithoutTargetJobNestedInput = {
    create?: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput> | TailoredResumeCreateWithoutTargetJobInput[] | TailoredResumeUncheckedCreateWithoutTargetJobInput[]
    connectOrCreate?: TailoredResumeCreateOrConnectWithoutTargetJobInput | TailoredResumeCreateOrConnectWithoutTargetJobInput[]
    upsert?: TailoredResumeUpsertWithWhereUniqueWithoutTargetJobInput | TailoredResumeUpsertWithWhereUniqueWithoutTargetJobInput[]
    createMany?: TailoredResumeCreateManyTargetJobInputEnvelope
    set?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    disconnect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    delete?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    connect?: TailoredResumeWhereUniqueInput | TailoredResumeWhereUniqueInput[]
    update?: TailoredResumeUpdateWithWhereUniqueWithoutTargetJobInput | TailoredResumeUpdateWithWhereUniqueWithoutTargetJobInput[]
    updateMany?: TailoredResumeUpdateManyWithWhereWithoutTargetJobInput | TailoredResumeUpdateManyWithWhereWithoutTargetJobInput[]
    deleteMany?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutTailoredResumesInput = {
    create?: XOR<WorkspaceCreateWithoutTailoredResumesInput, WorkspaceUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTailoredResumesInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type CandidateProfileVersionCreateNestedOneWithoutTailoredResumesInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutTailoredResumesInput
    connect?: CandidateProfileVersionWhereUniqueInput
  }

  export type TargetJobCreateNestedOneWithoutTailoredResumesInput = {
    create?: XOR<TargetJobCreateWithoutTailoredResumesInput, TargetJobUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: TargetJobCreateOrConnectWithoutTailoredResumesInput
    connect?: TargetJobWhereUniqueInput
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type WorkspaceUpdateOneRequiredWithoutTailoredResumesNestedInput = {
    create?: XOR<WorkspaceCreateWithoutTailoredResumesInput, WorkspaceUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTailoredResumesInput
    upsert?: WorkspaceUpsertWithoutTailoredResumesInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutTailoredResumesInput, WorkspaceUpdateWithoutTailoredResumesInput>, WorkspaceUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type CandidateProfileVersionUpdateOneRequiredWithoutTailoredResumesNestedInput = {
    create?: XOR<CandidateProfileVersionCreateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: CandidateProfileVersionCreateOrConnectWithoutTailoredResumesInput
    upsert?: CandidateProfileVersionUpsertWithoutTailoredResumesInput
    connect?: CandidateProfileVersionWhereUniqueInput
    update?: XOR<XOR<CandidateProfileVersionUpdateToOneWithWhereWithoutTailoredResumesInput, CandidateProfileVersionUpdateWithoutTailoredResumesInput>, CandidateProfileVersionUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type TargetJobUpdateOneRequiredWithoutTailoredResumesNestedInput = {
    create?: XOR<TargetJobCreateWithoutTailoredResumesInput, TargetJobUncheckedCreateWithoutTailoredResumesInput>
    connectOrCreate?: TargetJobCreateOrConnectWithoutTailoredResumesInput
    upsert?: TargetJobUpsertWithoutTailoredResumesInput
    connect?: TargetJobWhereUniqueInput
    update?: XOR<XOR<TargetJobUpdateToOneWithWhereWithoutTailoredResumesInput, TargetJobUpdateWithoutTailoredResumesInput>, TargetJobUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedEnumDocumentStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentStatus | EnumDocumentStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDocumentStatusFilter<$PrismaModel> | $Enums.DocumentStatus
  }

  export type NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentReasonCode | EnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel> | $Enums.DocumentReasonCode | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedEnumDocumentStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentStatus | EnumDocumentStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DocumentStatus[] | ListEnumDocumentStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDocumentStatusWithAggregatesFilter<$PrismaModel> | $Enums.DocumentStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDocumentStatusFilter<$PrismaModel>
    _max?: NestedEnumDocumentStatusFilter<$PrismaModel>
  }

  export type NestedEnumDocumentReasonCodeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DocumentReasonCode | EnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DocumentReasonCode[] | ListEnumDocumentReasonCodeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDocumentReasonCodeNullableWithAggregatesFilter<$PrismaModel> | $Enums.DocumentReasonCode | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel>
    _max?: NestedEnumDocumentReasonCodeNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumProfileVersionOriginFilter<$PrismaModel = never> = {
    equals?: $Enums.ProfileVersionOrigin | EnumProfileVersionOriginFieldRefInput<$PrismaModel>
    in?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    notIn?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    not?: NestedEnumProfileVersionOriginFilter<$PrismaModel> | $Enums.ProfileVersionOrigin
  }

  export type NestedEnumProfileVersionOriginWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ProfileVersionOrigin | EnumProfileVersionOriginFieldRefInput<$PrismaModel>
    in?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    notIn?: $Enums.ProfileVersionOrigin[] | ListEnumProfileVersionOriginFieldRefInput<$PrismaModel>
    not?: NestedEnumProfileVersionOriginWithAggregatesFilter<$PrismaModel> | $Enums.ProfileVersionOrigin
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumProfileVersionOriginFilter<$PrismaModel>
    _max?: NestedEnumProfileVersionOriginFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedEnumTargetJobStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TargetJobStatus | EnumTargetJobStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTargetJobStatusFilter<$PrismaModel> | $Enums.TargetJobStatus
  }

  export type NestedEnumTargetJobStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TargetJobStatus | EnumTargetJobStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TargetJobStatus[] | ListEnumTargetJobStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTargetJobStatusWithAggregatesFilter<$PrismaModel> | $Enums.TargetJobStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTargetJobStatusFilter<$PrismaModel>
    _max?: NestedEnumTargetJobStatusFilter<$PrismaModel>
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type AuditEventCreateWithoutWorkspaceInput = {
    id?: string
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AuditEventUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AuditEventCreateOrConnectWithoutWorkspaceInput = {
    where: AuditEventWhereUniqueInput
    create: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput>
  }

  export type AuditEventCreateManyWorkspaceInputEnvelope = {
    data: AuditEventCreateManyWorkspaceInput | AuditEventCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type CandidateDocumentCreateWithoutWorkspaceInput = {
    id?: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
    profileVersions?: CandidateProfileVersionCreateNestedManyWithoutDocumentInput
  }

  export type CandidateDocumentUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
    profileVersions?: CandidateProfileVersionUncheckedCreateNestedManyWithoutDocumentInput
  }

  export type CandidateDocumentCreateOrConnectWithoutWorkspaceInput = {
    where: CandidateDocumentWhereUniqueInput
    create: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput>
  }

  export type CandidateDocumentCreateManyWorkspaceInputEnvelope = {
    data: CandidateDocumentCreateManyWorkspaceInput | CandidateDocumentCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type CandidateProfileCreateWithoutWorkspaceInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    confirmedVersion?: CandidateProfileVersionCreateNestedOneWithoutConfirmedForInput
    versions?: CandidateProfileVersionCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    confirmedVersionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    versions?: CandidateProfileVersionUncheckedCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileCreateOrConnectWithoutWorkspaceInput = {
    where: CandidateProfileWhereUniqueInput
    create: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
  }

  export type TargetJobCreateWithoutWorkspaceInput = {
    id?: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutTargetJobInput
  }

  export type TargetJobUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutTargetJobInput
  }

  export type TargetJobCreateOrConnectWithoutWorkspaceInput = {
    where: TargetJobWhereUniqueInput
    create: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput>
  }

  export type TargetJobCreateManyWorkspaceInputEnvelope = {
    data: TargetJobCreateManyWorkspaceInput | TargetJobCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type TailoredResumeCreateWithoutWorkspaceInput = {
    id?: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
    profileVersion: CandidateProfileVersionCreateNestedOneWithoutTailoredResumesInput
    targetJob: TargetJobCreateNestedOneWithoutTailoredResumesInput
  }

  export type TailoredResumeUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    profileVersionId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeCreateOrConnectWithoutWorkspaceInput = {
    where: TailoredResumeWhereUniqueInput
    create: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput>
  }

  export type TailoredResumeCreateManyWorkspaceInputEnvelope = {
    data: TailoredResumeCreateManyWorkspaceInput | TailoredResumeCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type AuditEventUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: AuditEventWhereUniqueInput
    update: XOR<AuditEventUpdateWithoutWorkspaceInput, AuditEventUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<AuditEventCreateWithoutWorkspaceInput, AuditEventUncheckedCreateWithoutWorkspaceInput>
  }

  export type AuditEventUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: AuditEventWhereUniqueInput
    data: XOR<AuditEventUpdateWithoutWorkspaceInput, AuditEventUncheckedUpdateWithoutWorkspaceInput>
  }

  export type AuditEventUpdateManyWithWhereWithoutWorkspaceInput = {
    where: AuditEventScalarWhereInput
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type AuditEventScalarWhereInput = {
    AND?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
    OR?: AuditEventScalarWhereInput[]
    NOT?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
    id?: StringFilter<"AuditEvent"> | string
    workspaceId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    metadata?: JsonNullableFilter<"AuditEvent">
    createdAt?: DateTimeFilter<"AuditEvent"> | Date | string
  }

  export type CandidateDocumentUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: CandidateDocumentWhereUniqueInput
    update: XOR<CandidateDocumentUpdateWithoutWorkspaceInput, CandidateDocumentUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<CandidateDocumentCreateWithoutWorkspaceInput, CandidateDocumentUncheckedCreateWithoutWorkspaceInput>
  }

  export type CandidateDocumentUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: CandidateDocumentWhereUniqueInput
    data: XOR<CandidateDocumentUpdateWithoutWorkspaceInput, CandidateDocumentUncheckedUpdateWithoutWorkspaceInput>
  }

  export type CandidateDocumentUpdateManyWithWhereWithoutWorkspaceInput = {
    where: CandidateDocumentScalarWhereInput
    data: XOR<CandidateDocumentUpdateManyMutationInput, CandidateDocumentUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type CandidateDocumentScalarWhereInput = {
    AND?: CandidateDocumentScalarWhereInput | CandidateDocumentScalarWhereInput[]
    OR?: CandidateDocumentScalarWhereInput[]
    NOT?: CandidateDocumentScalarWhereInput | CandidateDocumentScalarWhereInput[]
    id?: StringFilter<"CandidateDocument"> | string
    workspaceId?: StringFilter<"CandidateDocument"> | string
    storageKey?: StringFilter<"CandidateDocument"> | string
    originalFilename?: StringFilter<"CandidateDocument"> | string
    contentType?: StringFilter<"CandidateDocument"> | string
    byteSize?: IntFilter<"CandidateDocument"> | number
    contentHash?: StringFilter<"CandidateDocument"> | string
    status?: EnumDocumentStatusFilter<"CandidateDocument"> | $Enums.DocumentStatus
    reasonCode?: EnumDocumentReasonCodeNullableFilter<"CandidateDocument"> | $Enums.DocumentReasonCode | null
    scannerName?: StringNullableFilter<"CandidateDocument"> | string | null
    scannedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    extractionAttempts?: IntFilter<"CandidateDocument"> | number
    extractionStartedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    retainUntil?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
    uploadedAt?: DateTimeFilter<"CandidateDocument"> | Date | string
    deletedAt?: DateTimeNullableFilter<"CandidateDocument"> | Date | string | null
  }

  export type CandidateProfileUpsertWithoutWorkspaceInput = {
    update: XOR<CandidateProfileUpdateWithoutWorkspaceInput, CandidateProfileUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<CandidateProfileCreateWithoutWorkspaceInput, CandidateProfileUncheckedCreateWithoutWorkspaceInput>
    where?: CandidateProfileWhereInput
  }

  export type CandidateProfileUpdateToOneWithWhereWithoutWorkspaceInput = {
    where?: CandidateProfileWhereInput
    data: XOR<CandidateProfileUpdateWithoutWorkspaceInput, CandidateProfileUncheckedUpdateWithoutWorkspaceInput>
  }

  export type CandidateProfileUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedVersion?: CandidateProfileVersionUpdateOneWithoutConfirmedForNestedInput
    versions?: CandidateProfileVersionUpdateManyWithoutProfileNestedInput
  }

  export type CandidateProfileUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    confirmedVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    versions?: CandidateProfileVersionUncheckedUpdateManyWithoutProfileNestedInput
  }

  export type TargetJobUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: TargetJobWhereUniqueInput
    update: XOR<TargetJobUpdateWithoutWorkspaceInput, TargetJobUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<TargetJobCreateWithoutWorkspaceInput, TargetJobUncheckedCreateWithoutWorkspaceInput>
  }

  export type TargetJobUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: TargetJobWhereUniqueInput
    data: XOR<TargetJobUpdateWithoutWorkspaceInput, TargetJobUncheckedUpdateWithoutWorkspaceInput>
  }

  export type TargetJobUpdateManyWithWhereWithoutWorkspaceInput = {
    where: TargetJobScalarWhereInput
    data: XOR<TargetJobUpdateManyMutationInput, TargetJobUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type TargetJobScalarWhereInput = {
    AND?: TargetJobScalarWhereInput | TargetJobScalarWhereInput[]
    OR?: TargetJobScalarWhereInput[]
    NOT?: TargetJobScalarWhereInput | TargetJobScalarWhereInput[]
    id?: StringFilter<"TargetJob"> | string
    workspaceId?: StringFilter<"TargetJob"> | string
    sourceUrl?: StringFilter<"TargetJob"> | string
    rawText?: StringNullableFilter<"TargetJob"> | string | null
    title?: StringNullableFilter<"TargetJob"> | string | null
    employer?: StringNullableFilter<"TargetJob"> | string | null
    status?: EnumTargetJobStatusFilter<"TargetJob"> | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFilter<"TargetJob"> | Date | string
    createdAt?: DateTimeFilter<"TargetJob"> | Date | string
  }

  export type TailoredResumeUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: TailoredResumeWhereUniqueInput
    update: XOR<TailoredResumeUpdateWithoutWorkspaceInput, TailoredResumeUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<TailoredResumeCreateWithoutWorkspaceInput, TailoredResumeUncheckedCreateWithoutWorkspaceInput>
  }

  export type TailoredResumeUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: TailoredResumeWhereUniqueInput
    data: XOR<TailoredResumeUpdateWithoutWorkspaceInput, TailoredResumeUncheckedUpdateWithoutWorkspaceInput>
  }

  export type TailoredResumeUpdateManyWithWhereWithoutWorkspaceInput = {
    where: TailoredResumeScalarWhereInput
    data: XOR<TailoredResumeUpdateManyMutationInput, TailoredResumeUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type TailoredResumeScalarWhereInput = {
    AND?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
    OR?: TailoredResumeScalarWhereInput[]
    NOT?: TailoredResumeScalarWhereInput | TailoredResumeScalarWhereInput[]
    id?: StringFilter<"TailoredResume"> | string
    workspaceId?: StringFilter<"TailoredResume"> | string
    profileVersionId?: StringFilter<"TailoredResume"> | string
    targetJobId?: StringFilter<"TailoredResume"> | string
    content?: JsonFilter<"TailoredResume">
    templateKey?: StringFilter<"TailoredResume"> | string
    aiJobId?: StringNullableFilter<"TailoredResume"> | string | null
    promptVersion?: StringFilter<"TailoredResume"> | string
    modelVersion?: StringFilter<"TailoredResume"> | string
    degraded?: BoolFilter<"TailoredResume"> | boolean
    createdAt?: DateTimeFilter<"TailoredResume"> | Date | string
  }

  export type WorkspaceCreateWithoutAuditEventsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    documents?: CandidateDocumentCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutAuditEventsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    documents?: CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutAuditEventsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutAuditEventsInput, WorkspaceUncheckedCreateWithoutAuditEventsInput>
  }

  export type WorkspaceUpsertWithoutAuditEventsInput = {
    update: XOR<WorkspaceUpdateWithoutAuditEventsInput, WorkspaceUncheckedUpdateWithoutAuditEventsInput>
    create: XOR<WorkspaceCreateWithoutAuditEventsInput, WorkspaceUncheckedCreateWithoutAuditEventsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutAuditEventsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutAuditEventsInput, WorkspaceUncheckedUpdateWithoutAuditEventsInput>
  }

  export type WorkspaceUpdateWithoutAuditEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    documents?: CandidateDocumentUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutAuditEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    documents?: CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceCreateWithoutDocumentsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutDocumentsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutDocumentsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutDocumentsInput, WorkspaceUncheckedCreateWithoutDocumentsInput>
  }

  export type CandidateProfileVersionCreateWithoutDocumentInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutDocumentInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutDocumentInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput>
  }

  export type CandidateProfileVersionCreateManyDocumentInputEnvelope = {
    data: CandidateProfileVersionCreateManyDocumentInput | CandidateProfileVersionCreateManyDocumentInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutDocumentsInput = {
    update: XOR<WorkspaceUpdateWithoutDocumentsInput, WorkspaceUncheckedUpdateWithoutDocumentsInput>
    create: XOR<WorkspaceCreateWithoutDocumentsInput, WorkspaceUncheckedCreateWithoutDocumentsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutDocumentsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutDocumentsInput, WorkspaceUncheckedUpdateWithoutDocumentsInput>
  }

  export type WorkspaceUpdateWithoutDocumentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutDocumentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type CandidateProfileVersionUpsertWithWhereUniqueWithoutDocumentInput = {
    where: CandidateProfileVersionWhereUniqueInput
    update: XOR<CandidateProfileVersionUpdateWithoutDocumentInput, CandidateProfileVersionUncheckedUpdateWithoutDocumentInput>
    create: XOR<CandidateProfileVersionCreateWithoutDocumentInput, CandidateProfileVersionUncheckedCreateWithoutDocumentInput>
  }

  export type CandidateProfileVersionUpdateWithWhereUniqueWithoutDocumentInput = {
    where: CandidateProfileVersionWhereUniqueInput
    data: XOR<CandidateProfileVersionUpdateWithoutDocumentInput, CandidateProfileVersionUncheckedUpdateWithoutDocumentInput>
  }

  export type CandidateProfileVersionUpdateManyWithWhereWithoutDocumentInput = {
    where: CandidateProfileVersionScalarWhereInput
    data: XOR<CandidateProfileVersionUpdateManyMutationInput, CandidateProfileVersionUncheckedUpdateManyWithoutDocumentInput>
  }

  export type CandidateProfileVersionScalarWhereInput = {
    AND?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
    OR?: CandidateProfileVersionScalarWhereInput[]
    NOT?: CandidateProfileVersionScalarWhereInput | CandidateProfileVersionScalarWhereInput[]
    id?: StringFilter<"CandidateProfileVersion"> | string
    profileId?: StringFilter<"CandidateProfileVersion"> | string
    versionNumber?: IntFilter<"CandidateProfileVersion"> | number
    origin?: EnumProfileVersionOriginFilter<"CandidateProfileVersion"> | $Enums.ProfileVersionOrigin
    parentVersionId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    documentId?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    sourceContentHash?: StringNullableFilter<"CandidateProfileVersion"> | string | null
    extractorName?: StringFilter<"CandidateProfileVersion"> | string
    extractorVersion?: StringFilter<"CandidateProfileVersion"> | string
    content?: JsonFilter<"CandidateProfileVersion">
    confidence?: JsonNullableFilter<"CandidateProfileVersion">
    createdAt?: DateTimeFilter<"CandidateProfileVersion"> | Date | string
  }

  export type WorkspaceCreateWithoutProfileInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentCreateNestedManyWithoutWorkspaceInput
    targetJobs?: TargetJobCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutProfileInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput
    targetJobs?: TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutProfileInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutProfileInput, WorkspaceUncheckedCreateWithoutProfileInput>
  }

  export type CandidateProfileVersionCreateWithoutConfirmedForInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutConfirmedForInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutConfirmedForInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutConfirmedForInput, CandidateProfileVersionUncheckedCreateWithoutConfirmedForInput>
  }

  export type CandidateProfileVersionCreateWithoutProfileInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutProfileInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutProfileInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput>
  }

  export type CandidateProfileVersionCreateManyProfileInputEnvelope = {
    data: CandidateProfileVersionCreateManyProfileInput | CandidateProfileVersionCreateManyProfileInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutProfileInput = {
    update: XOR<WorkspaceUpdateWithoutProfileInput, WorkspaceUncheckedUpdateWithoutProfileInput>
    create: XOR<WorkspaceCreateWithoutProfileInput, WorkspaceUncheckedCreateWithoutProfileInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutProfileInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutProfileInput, WorkspaceUncheckedUpdateWithoutProfileInput>
  }

  export type WorkspaceUpdateWithoutProfileInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUpdateManyWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutProfileInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type CandidateProfileVersionUpsertWithoutConfirmedForInput = {
    update: XOR<CandidateProfileVersionUpdateWithoutConfirmedForInput, CandidateProfileVersionUncheckedUpdateWithoutConfirmedForInput>
    create: XOR<CandidateProfileVersionCreateWithoutConfirmedForInput, CandidateProfileVersionUncheckedCreateWithoutConfirmedForInput>
    where?: CandidateProfileVersionWhereInput
  }

  export type CandidateProfileVersionUpdateToOneWithWhereWithoutConfirmedForInput = {
    where?: CandidateProfileVersionWhereInput
    data: XOR<CandidateProfileVersionUpdateWithoutConfirmedForInput, CandidateProfileVersionUncheckedUpdateWithoutConfirmedForInput>
  }

  export type CandidateProfileVersionUpdateWithoutConfirmedForInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutConfirmedForInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUpsertWithWhereUniqueWithoutProfileInput = {
    where: CandidateProfileVersionWhereUniqueInput
    update: XOR<CandidateProfileVersionUpdateWithoutProfileInput, CandidateProfileVersionUncheckedUpdateWithoutProfileInput>
    create: XOR<CandidateProfileVersionCreateWithoutProfileInput, CandidateProfileVersionUncheckedCreateWithoutProfileInput>
  }

  export type CandidateProfileVersionUpdateWithWhereUniqueWithoutProfileInput = {
    where: CandidateProfileVersionWhereUniqueInput
    data: XOR<CandidateProfileVersionUpdateWithoutProfileInput, CandidateProfileVersionUncheckedUpdateWithoutProfileInput>
  }

  export type CandidateProfileVersionUpdateManyWithWhereWithoutProfileInput = {
    where: CandidateProfileVersionScalarWhereInput
    data: XOR<CandidateProfileVersionUpdateManyMutationInput, CandidateProfileVersionUncheckedUpdateManyWithoutProfileInput>
  }

  export type CandidateProfileCreateWithoutVersionsInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutProfileInput
    confirmedVersion?: CandidateProfileVersionCreateNestedOneWithoutConfirmedForInput
  }

  export type CandidateProfileUncheckedCreateWithoutVersionsInput = {
    id?: string
    workspaceId: string
    confirmedVersionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CandidateProfileCreateOrConnectWithoutVersionsInput = {
    where: CandidateProfileWhereUniqueInput
    create: XOR<CandidateProfileCreateWithoutVersionsInput, CandidateProfileUncheckedCreateWithoutVersionsInput>
  }

  export type CandidateProfileVersionCreateWithoutChildrenInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutChildrenInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutChildrenInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutChildrenInput, CandidateProfileVersionUncheckedCreateWithoutChildrenInput>
  }

  export type CandidateProfileVersionCreateWithoutParentVersionInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutParentVersionInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutProfileVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutParentVersionInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput>
  }

  export type CandidateProfileVersionCreateManyParentVersionInputEnvelope = {
    data: CandidateProfileVersionCreateManyParentVersionInput | CandidateProfileVersionCreateManyParentVersionInput[]
    skipDuplicates?: boolean
  }

  export type CandidateDocumentCreateWithoutProfileVersionsInput = {
    id?: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
    workspace: WorkspaceCreateNestedOneWithoutDocumentsInput
  }

  export type CandidateDocumentUncheckedCreateWithoutProfileVersionsInput = {
    id?: string
    workspaceId: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
  }

  export type CandidateDocumentCreateOrConnectWithoutProfileVersionsInput = {
    where: CandidateDocumentWhereUniqueInput
    create: XOR<CandidateDocumentCreateWithoutProfileVersionsInput, CandidateDocumentUncheckedCreateWithoutProfileVersionsInput>
  }

  export type CandidateProfileCreateWithoutConfirmedVersionInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutProfileInput
    versions?: CandidateProfileVersionCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileUncheckedCreateWithoutConfirmedVersionInput = {
    id?: string
    workspaceId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    versions?: CandidateProfileVersionUncheckedCreateNestedManyWithoutProfileInput
  }

  export type CandidateProfileCreateOrConnectWithoutConfirmedVersionInput = {
    where: CandidateProfileWhereUniqueInput
    create: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
  }

  export type TailoredResumeCreateWithoutProfileVersionInput = {
    id?: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutTailoredResumesInput
    targetJob: TargetJobCreateNestedOneWithoutTailoredResumesInput
  }

  export type TailoredResumeUncheckedCreateWithoutProfileVersionInput = {
    id?: string
    workspaceId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeCreateOrConnectWithoutProfileVersionInput = {
    where: TailoredResumeWhereUniqueInput
    create: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput>
  }

  export type TailoredResumeCreateManyProfileVersionInputEnvelope = {
    data: TailoredResumeCreateManyProfileVersionInput | TailoredResumeCreateManyProfileVersionInput[]
    skipDuplicates?: boolean
  }

  export type CandidateProfileUpsertWithoutVersionsInput = {
    update: XOR<CandidateProfileUpdateWithoutVersionsInput, CandidateProfileUncheckedUpdateWithoutVersionsInput>
    create: XOR<CandidateProfileCreateWithoutVersionsInput, CandidateProfileUncheckedCreateWithoutVersionsInput>
    where?: CandidateProfileWhereInput
  }

  export type CandidateProfileUpdateToOneWithWhereWithoutVersionsInput = {
    where?: CandidateProfileWhereInput
    data: XOR<CandidateProfileUpdateWithoutVersionsInput, CandidateProfileUncheckedUpdateWithoutVersionsInput>
  }

  export type CandidateProfileUpdateWithoutVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutProfileNestedInput
    confirmedVersion?: CandidateProfileVersionUpdateOneWithoutConfirmedForNestedInput
  }

  export type CandidateProfileUncheckedUpdateWithoutVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    confirmedVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionUpsertWithoutChildrenInput = {
    update: XOR<CandidateProfileVersionUpdateWithoutChildrenInput, CandidateProfileVersionUncheckedUpdateWithoutChildrenInput>
    create: XOR<CandidateProfileVersionCreateWithoutChildrenInput, CandidateProfileVersionUncheckedCreateWithoutChildrenInput>
    where?: CandidateProfileVersionWhereInput
  }

  export type CandidateProfileVersionUpdateToOneWithWhereWithoutChildrenInput = {
    where?: CandidateProfileVersionWhereInput
    data: XOR<CandidateProfileVersionUpdateWithoutChildrenInput, CandidateProfileVersionUncheckedUpdateWithoutChildrenInput>
  }

  export type CandidateProfileVersionUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUpsertWithWhereUniqueWithoutParentVersionInput = {
    where: CandidateProfileVersionWhereUniqueInput
    update: XOR<CandidateProfileVersionUpdateWithoutParentVersionInput, CandidateProfileVersionUncheckedUpdateWithoutParentVersionInput>
    create: XOR<CandidateProfileVersionCreateWithoutParentVersionInput, CandidateProfileVersionUncheckedCreateWithoutParentVersionInput>
  }

  export type CandidateProfileVersionUpdateWithWhereUniqueWithoutParentVersionInput = {
    where: CandidateProfileVersionWhereUniqueInput
    data: XOR<CandidateProfileVersionUpdateWithoutParentVersionInput, CandidateProfileVersionUncheckedUpdateWithoutParentVersionInput>
  }

  export type CandidateProfileVersionUpdateManyWithWhereWithoutParentVersionInput = {
    where: CandidateProfileVersionScalarWhereInput
    data: XOR<CandidateProfileVersionUpdateManyMutationInput, CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionInput>
  }

  export type CandidateDocumentUpsertWithoutProfileVersionsInput = {
    update: XOR<CandidateDocumentUpdateWithoutProfileVersionsInput, CandidateDocumentUncheckedUpdateWithoutProfileVersionsInput>
    create: XOR<CandidateDocumentCreateWithoutProfileVersionsInput, CandidateDocumentUncheckedCreateWithoutProfileVersionsInput>
    where?: CandidateDocumentWhereInput
  }

  export type CandidateDocumentUpdateToOneWithWhereWithoutProfileVersionsInput = {
    where?: CandidateDocumentWhereInput
    data: XOR<CandidateDocumentUpdateWithoutProfileVersionsInput, CandidateDocumentUncheckedUpdateWithoutProfileVersionsInput>
  }

  export type CandidateDocumentUpdateWithoutProfileVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    workspace?: WorkspaceUpdateOneRequiredWithoutDocumentsNestedInput
  }

  export type CandidateDocumentUncheckedUpdateWithoutProfileVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type CandidateProfileUpsertWithoutConfirmedVersionInput = {
    update: XOR<CandidateProfileUpdateWithoutConfirmedVersionInput, CandidateProfileUncheckedUpdateWithoutConfirmedVersionInput>
    create: XOR<CandidateProfileCreateWithoutConfirmedVersionInput, CandidateProfileUncheckedCreateWithoutConfirmedVersionInput>
    where?: CandidateProfileWhereInput
  }

  export type CandidateProfileUpdateToOneWithWhereWithoutConfirmedVersionInput = {
    where?: CandidateProfileWhereInput
    data: XOR<CandidateProfileUpdateWithoutConfirmedVersionInput, CandidateProfileUncheckedUpdateWithoutConfirmedVersionInput>
  }

  export type CandidateProfileUpdateWithoutConfirmedVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutProfileNestedInput
    versions?: CandidateProfileVersionUpdateManyWithoutProfileNestedInput
  }

  export type CandidateProfileUncheckedUpdateWithoutConfirmedVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    versions?: CandidateProfileVersionUncheckedUpdateManyWithoutProfileNestedInput
  }

  export type TailoredResumeUpsertWithWhereUniqueWithoutProfileVersionInput = {
    where: TailoredResumeWhereUniqueInput
    update: XOR<TailoredResumeUpdateWithoutProfileVersionInput, TailoredResumeUncheckedUpdateWithoutProfileVersionInput>
    create: XOR<TailoredResumeCreateWithoutProfileVersionInput, TailoredResumeUncheckedCreateWithoutProfileVersionInput>
  }

  export type TailoredResumeUpdateWithWhereUniqueWithoutProfileVersionInput = {
    where: TailoredResumeWhereUniqueInput
    data: XOR<TailoredResumeUpdateWithoutProfileVersionInput, TailoredResumeUncheckedUpdateWithoutProfileVersionInput>
  }

  export type TailoredResumeUpdateManyWithWhereWithoutProfileVersionInput = {
    where: TailoredResumeScalarWhereInput
    data: XOR<TailoredResumeUpdateManyMutationInput, TailoredResumeUncheckedUpdateManyWithoutProfileVersionInput>
  }

  export type WorkspaceCreateWithoutTargetJobsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileCreateNestedOneWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutTargetJobsInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput
    tailoredResumes?: TailoredResumeUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutTargetJobsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutTargetJobsInput, WorkspaceUncheckedCreateWithoutTargetJobsInput>
  }

  export type TailoredResumeCreateWithoutTargetJobInput = {
    id?: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutTailoredResumesInput
    profileVersion: CandidateProfileVersionCreateNestedOneWithoutTailoredResumesInput
  }

  export type TailoredResumeUncheckedCreateWithoutTargetJobInput = {
    id?: string
    workspaceId: string
    profileVersionId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeCreateOrConnectWithoutTargetJobInput = {
    where: TailoredResumeWhereUniqueInput
    create: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput>
  }

  export type TailoredResumeCreateManyTargetJobInputEnvelope = {
    data: TailoredResumeCreateManyTargetJobInput | TailoredResumeCreateManyTargetJobInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutTargetJobsInput = {
    update: XOR<WorkspaceUpdateWithoutTargetJobsInput, WorkspaceUncheckedUpdateWithoutTargetJobsInput>
    create: XOR<WorkspaceCreateWithoutTargetJobsInput, WorkspaceUncheckedCreateWithoutTargetJobsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutTargetJobsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutTargetJobsInput, WorkspaceUncheckedUpdateWithoutTargetJobsInput>
  }

  export type WorkspaceUpdateWithoutTargetJobsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUpdateOneWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutTargetJobsInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type TailoredResumeUpsertWithWhereUniqueWithoutTargetJobInput = {
    where: TailoredResumeWhereUniqueInput
    update: XOR<TailoredResumeUpdateWithoutTargetJobInput, TailoredResumeUncheckedUpdateWithoutTargetJobInput>
    create: XOR<TailoredResumeCreateWithoutTargetJobInput, TailoredResumeUncheckedCreateWithoutTargetJobInput>
  }

  export type TailoredResumeUpdateWithWhereUniqueWithoutTargetJobInput = {
    where: TailoredResumeWhereUniqueInput
    data: XOR<TailoredResumeUpdateWithoutTargetJobInput, TailoredResumeUncheckedUpdateWithoutTargetJobInput>
  }

  export type TailoredResumeUpdateManyWithWhereWithoutTargetJobInput = {
    where: TailoredResumeScalarWhereInput
    data: XOR<TailoredResumeUpdateManyMutationInput, TailoredResumeUncheckedUpdateManyWithoutTargetJobInput>
  }

  export type WorkspaceCreateWithoutTailoredResumesInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutTailoredResumesInput = {
    id?: string
    platformUserId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutWorkspaceInput
    documents?: CandidateDocumentUncheckedCreateNestedManyWithoutWorkspaceInput
    profile?: CandidateProfileUncheckedCreateNestedOneWithoutWorkspaceInput
    targetJobs?: TargetJobUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutTailoredResumesInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutTailoredResumesInput, WorkspaceUncheckedCreateWithoutTailoredResumesInput>
  }

  export type CandidateProfileVersionCreateWithoutTailoredResumesInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    profile: CandidateProfileCreateNestedOneWithoutVersionsInput
    parentVersion?: CandidateProfileVersionCreateNestedOneWithoutChildrenInput
    children?: CandidateProfileVersionCreateNestedManyWithoutParentVersionInput
    document?: CandidateDocumentCreateNestedOneWithoutProfileVersionsInput
    confirmedFor?: CandidateProfileCreateNestedOneWithoutConfirmedVersionInput
  }

  export type CandidateProfileVersionUncheckedCreateWithoutTailoredResumesInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    children?: CandidateProfileVersionUncheckedCreateNestedManyWithoutParentVersionInput
    confirmedFor?: CandidateProfileUncheckedCreateNestedOneWithoutConfirmedVersionInput
  }

  export type CandidateProfileVersionCreateOrConnectWithoutTailoredResumesInput = {
    where: CandidateProfileVersionWhereUniqueInput
    create: XOR<CandidateProfileVersionCreateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedCreateWithoutTailoredResumesInput>
  }

  export type TargetJobCreateWithoutTailoredResumesInput = {
    id?: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutTargetJobsInput
  }

  export type TargetJobUncheckedCreateWithoutTailoredResumesInput = {
    id?: string
    workspaceId: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
  }

  export type TargetJobCreateOrConnectWithoutTailoredResumesInput = {
    where: TargetJobWhereUniqueInput
    create: XOR<TargetJobCreateWithoutTailoredResumesInput, TargetJobUncheckedCreateWithoutTailoredResumesInput>
  }

  export type WorkspaceUpsertWithoutTailoredResumesInput = {
    update: XOR<WorkspaceUpdateWithoutTailoredResumesInput, WorkspaceUncheckedUpdateWithoutTailoredResumesInput>
    create: XOR<WorkspaceCreateWithoutTailoredResumesInput, WorkspaceUncheckedCreateWithoutTailoredResumesInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutTailoredResumesInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutTailoredResumesInput, WorkspaceUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type WorkspaceUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    platformUserId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    auditEvents?: AuditEventUncheckedUpdateManyWithoutWorkspaceNestedInput
    documents?: CandidateDocumentUncheckedUpdateManyWithoutWorkspaceNestedInput
    profile?: CandidateProfileUncheckedUpdateOneWithoutWorkspaceNestedInput
    targetJobs?: TargetJobUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type CandidateProfileVersionUpsertWithoutTailoredResumesInput = {
    update: XOR<CandidateProfileVersionUpdateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedUpdateWithoutTailoredResumesInput>
    create: XOR<CandidateProfileVersionCreateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedCreateWithoutTailoredResumesInput>
    where?: CandidateProfileVersionWhereInput
  }

  export type CandidateProfileVersionUpdateToOneWithWhereWithoutTailoredResumesInput = {
    where?: CandidateProfileVersionWhereInput
    data: XOR<CandidateProfileVersionUpdateWithoutTailoredResumesInput, CandidateProfileVersionUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type CandidateProfileVersionUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
  }

  export type TargetJobUpsertWithoutTailoredResumesInput = {
    update: XOR<TargetJobUpdateWithoutTailoredResumesInput, TargetJobUncheckedUpdateWithoutTailoredResumesInput>
    create: XOR<TargetJobCreateWithoutTailoredResumesInput, TargetJobUncheckedCreateWithoutTailoredResumesInput>
    where?: TargetJobWhereInput
  }

  export type TargetJobUpdateToOneWithWhereWithoutTailoredResumesInput = {
    where?: TargetJobWhereInput
    data: XOR<TargetJobUpdateWithoutTailoredResumesInput, TargetJobUncheckedUpdateWithoutTailoredResumesInput>
  }

  export type TargetJobUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutTargetJobsNestedInput
  }

  export type TargetJobUncheckedUpdateWithoutTailoredResumesInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventCreateManyWorkspaceInput = {
    id?: string
    action: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type CandidateDocumentCreateManyWorkspaceInput = {
    id?: string
    storageKey: string
    originalFilename: string
    contentType: string
    byteSize: number
    contentHash: string
    status?: $Enums.DocumentStatus
    reasonCode?: $Enums.DocumentReasonCode | null
    scannerName?: string | null
    scannedAt?: Date | string | null
    extractionAttempts?: number
    extractionStartedAt?: Date | string | null
    retainUntil?: Date | string | null
    uploadedAt?: Date | string
    deletedAt?: Date | string | null
  }

  export type TargetJobCreateManyWorkspaceInput = {
    id?: string
    sourceUrl: string
    rawText?: string | null
    title?: string | null
    employer?: string | null
    status: $Enums.TargetJobStatus
    fetchedAt?: Date | string
    createdAt?: Date | string
  }

  export type TailoredResumeCreateManyWorkspaceInput = {
    id?: string
    profileVersionId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type AuditEventUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateDocumentUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    profileVersions?: CandidateProfileVersionUpdateManyWithoutDocumentNestedInput
  }

  export type CandidateDocumentUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    profileVersions?: CandidateProfileVersionUncheckedUpdateManyWithoutDocumentNestedInput
  }

  export type CandidateDocumentUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    storageKey?: StringFieldUpdateOperationsInput | string
    originalFilename?: StringFieldUpdateOperationsInput | string
    contentType?: StringFieldUpdateOperationsInput | string
    byteSize?: IntFieldUpdateOperationsInput | number
    contentHash?: StringFieldUpdateOperationsInput | string
    status?: EnumDocumentStatusFieldUpdateOperationsInput | $Enums.DocumentStatus
    reasonCode?: NullableEnumDocumentReasonCodeFieldUpdateOperationsInput | $Enums.DocumentReasonCode | null
    scannerName?: NullableStringFieldUpdateOperationsInput | string | null
    scannedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    extractionAttempts?: IntFieldUpdateOperationsInput | number
    extractionStartedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retainUntil?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    uploadedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type TargetJobUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tailoredResumes?: TailoredResumeUpdateManyWithoutTargetJobNestedInput
  }

  export type TargetJobUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutTargetJobNestedInput
  }

  export type TargetJobUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    rawText?: NullableStringFieldUpdateOperationsInput | string | null
    title?: NullableStringFieldUpdateOperationsInput | string | null
    employer?: NullableStringFieldUpdateOperationsInput | string | null
    status?: EnumTargetJobStatusFieldUpdateOperationsInput | $Enums.TargetJobStatus
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profileVersion?: CandidateProfileVersionUpdateOneRequiredWithoutTailoredResumesNestedInput
    targetJob?: TargetJobUpdateOneRequiredWithoutTailoredResumesNestedInput
  }

  export type TailoredResumeUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionCreateManyDocumentInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type CandidateProfileVersionUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionCreateManyProfileInput = {
    id?: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    parentVersionId?: string | null
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type CandidateProfileVersionUpdateWithoutProfileInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parentVersion?: CandidateProfileVersionUpdateOneWithoutChildrenNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutProfileInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutProfileInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    parentVersionId?: NullableStringFieldUpdateOperationsInput | string | null
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CandidateProfileVersionCreateManyParentVersionInput = {
    id?: string
    profileId: string
    versionNumber: number
    origin: $Enums.ProfileVersionOrigin
    documentId?: string | null
    sourceContentHash?: string | null
    extractorName: string
    extractorVersion: string
    content: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type TailoredResumeCreateManyProfileVersionInput = {
    id?: string
    workspaceId: string
    targetJobId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type CandidateProfileVersionUpdateWithoutParentVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    profile?: CandidateProfileUpdateOneRequiredWithoutVersionsNestedInput
    children?: CandidateProfileVersionUpdateManyWithoutParentVersionNestedInput
    document?: CandidateDocumentUpdateOneWithoutProfileVersionsNestedInput
    confirmedFor?: CandidateProfileUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateWithoutParentVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionNestedInput
    confirmedFor?: CandidateProfileUncheckedUpdateOneWithoutConfirmedVersionNestedInput
    tailoredResumes?: TailoredResumeUncheckedUpdateManyWithoutProfileVersionNestedInput
  }

  export type CandidateProfileVersionUncheckedUpdateManyWithoutParentVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    profileId?: StringFieldUpdateOperationsInput | string
    versionNumber?: IntFieldUpdateOperationsInput | number
    origin?: EnumProfileVersionOriginFieldUpdateOperationsInput | $Enums.ProfileVersionOrigin
    documentId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceContentHash?: NullableStringFieldUpdateOperationsInput | string | null
    extractorName?: StringFieldUpdateOperationsInput | string
    extractorVersion?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    confidence?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUpdateWithoutProfileVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutTailoredResumesNestedInput
    targetJob?: TargetJobUpdateOneRequiredWithoutTailoredResumesNestedInput
  }

  export type TailoredResumeUncheckedUpdateWithoutProfileVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUncheckedUpdateManyWithoutProfileVersionInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    targetJobId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeCreateManyTargetJobInput = {
    id?: string
    workspaceId: string
    profileVersionId: string
    content: JsonNullValueInput | InputJsonValue
    templateKey: string
    aiJobId?: string | null
    promptVersion: string
    modelVersion: string
    degraded?: boolean
    createdAt?: Date | string
  }

  export type TailoredResumeUpdateWithoutTargetJobInput = {
    id?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutTailoredResumesNestedInput
    profileVersion?: CandidateProfileVersionUpdateOneRequiredWithoutTailoredResumesNestedInput
  }

  export type TailoredResumeUncheckedUpdateWithoutTargetJobInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TailoredResumeUncheckedUpdateManyWithoutTargetJobInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    profileVersionId?: StringFieldUpdateOperationsInput | string
    content?: JsonNullValueInput | InputJsonValue
    templateKey?: StringFieldUpdateOperationsInput | string
    aiJobId?: NullableStringFieldUpdateOperationsInput | string | null
    promptVersion?: StringFieldUpdateOperationsInput | string
    modelVersion?: StringFieldUpdateOperationsInput | string
    degraded?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}