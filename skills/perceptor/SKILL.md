---
name: perceptor
description: Launch Perceptor — interactive Obsidian-style folder/dependency & behavior map of a repository (Graph mode = folders sized by connections, Folder mode = VS-style tree). Also processes Phase-2 change tasks via "/perceptor tasks". Use when the user types /perceptor or asks to visualize/map the codebase, or to process perceptor tasks.
---

## Mode dispatch

- If `$ARGUMENTS` begins with `tasks` → go to **"Task processing mode"** below.
- Otherwise → **launch** info (steps below).

## What it does

**Perceptor is a VS Code extension** (npm workspaces monorepo). It scans a
repo with tree-sitter (Java, C#, TypeScript/TSX/JS; extensible) and renders an
interactive map inside a webview — **no HTTP server, no browser, no localhost**.
The webview talks to the extension host over the VS Code message channel; the
analyzer + task engine run in the extension host (the user's machine), so Claude
tasks use the user's own `claude` CLI/tokens.

- **Graph mode**: folders as circle nodes sized by cross-folder connections.
- **Folder mode**: VS Code-style collapsible tree (folder > class > behaviors).
- **Chat mode**: free-form conversation — describe a requirement, Claude implements it
  as a `request` task following the repo's coding preferences.
- **Changes mode**: every task's diff shown git-style (per file/hunk, +/-) with an
  approve/reject review gate.
- **⚙ Prefs**: per-repo `coding-preferences.json` the user fills; Claude obeys it.
- **Tasks**: add/edit/move-behavior, create file/folder → a change task is queued.

## Configuration

- `PERCEPTOR_HOME` — the Perceptor **source** checkout, only needed if you are
  developing/building the extension itself. End users install the packaged `.vsix` and
  never need this; the extension provisions this skill for them automatically.
  **Task-processing mode (below) never uses `PERCEPTOR_HOME`** — it operates purely on
  the `<TARGET_ROOT>` passed in `$ARGUMENTS`. If you do need it (dev/launch only),
  resolve it from the current checkout rather than assuming a fixed path.
- Packages: `packages/core` (engine: analyzer + CoreService + CLI), `packages/extension`.

## Launch (it's an extension — you can't open the webview for the user)

This section is for **developing** the extension; end users just install the `.vsix`
and click the **Perceptor** status-bar item (or run "Perceptor: Open").

1. Ensure built: `cd $PERCEPTOR_HOME && npm install && npm run build` (if needed).
2. Tell the user (in the §"Output language" locale) to open the map in VS Code:
   - Dev: open `$PERCEPTOR_HOME` in VS Code → **F5** → in the Extension Development
     Host: `Cmd+Shift+P` → **"Perceptor: Open"**.
   - Installed: `npm run package` → `code --install-extension
     packages/extension/*.vsix` → `Cmd+Shift+P` → "Perceptor: Open".
3. Optional headless graph: `node packages/core/dist/cli.js "<TARGET_ROOT>"` writes
   `<TARGET_ROOT>/.perceptor/graph.json` (analyze-only, no UI).

## Notes

- Add a language: register it in `packages/core/src/core/LanguageRegistry.ts` +
  add an extractor under `packages/core/src/core/extractors/` (implement
  `LanguageExtractor` / extend `AbstractExtractor`).
- Suggest gitignoring `.perceptor/` in the target repo.

---

# Task processing mode  (`/perceptor tasks [repoPath]`)

The UI queues change requests in `<TARGET_ROOT>/.perceptor/pending-actions.json`.
Task types:

- **`move-behavior`** — drag a method from class A onto class B (move it).
- **`add-behavior`** — "+ behavior" on a class: user describes a new behavior
  (`spec.description`, optional `spec.name`/`signature`); implement it on that class.
- **`edit-behavior`** — click a method: `from.behavior` at lines
  `spec.line`–`spec.endLine` in `from.file`; `spec.description` says how to change it
  (optional new `spec.signature`). Modify that method in place.
- **`create-file`** — new file `spec.name` in directory `from.dir`; `spec.description`
  says what it should contain. Scaffold it following repo conventions (correct class,
  imports, DI style); create parent dirs if needed.
- **`create-folder`** — new folder `spec.name` under `from.dir`. Create the directory
  (and any intermediate dirs).
- **`request`** — a free-form requirement typed in the **Chat** tab: `spec.description`
  is natural language ("add pagination to OrderService", "extract a Repository for X").
  `from`/`to` are null. Plan and implement it across the repo (possibly multi-file),
  following the coding preferences. Same propose → approve → apply lifecycle; the diff
  shows up in the **Changes** tab for review.
- **`describe-behavior`** — a no-code explanation request from the Folder method drawer:
  `from.{class,file,behavior}` + `spec.{line,endLine,flowOutline}`. The analyzer pre-extracts
  the control flow into `spec.flowOutline` (a compact branch/call/return skeleton) so you
  narrate the logic branch-by-branch without re-deriving structure (token-optimized). Read
  that method and write a faithful, COMPLETE plain-English explanation of every meaningful
  step it performs (validations, service/DB calls, side effects, what each branch does,
  return) — a few short sentences, not a vague one-liner — and report it with the `described`
  result (see §"Result file contract"). **No diff, no code change.** See §3c.

Your job here is to act on that queue. **You READ `pending-actions.json` but you do
NOT write it.** You report your outcome by writing ONE file — your task's own result
file `.perceptor/results/<id>.json` (see §"Result file contract"). The host is the
sole writer of the queue and merges your result in; this lets several tasks run in
parallel without ever racing on a shared file. **All generated code MUST follow
Berkcan's coding best-practices** (see his
CLAUDE.md / memory: constructor injection, no magic strings, meaningful names,
single responsibility, ~30-line methods, no boolean params, guard predicates,
encapsulation, OOP-first; tests/compilation must not break).

## 1. Resolve the target repo

- If `$ARGUMENTS` has a path after `tasks`, use it as `<TARGET_ROOT>`.
- Else use the current working directory if it has `.perceptor/pending-actions.json`.
  (There is no server/localhost — the UI is a VS Code webview; the queue file is the
  only contract.)

## 1a. Single-task mode (`--task <id>`) — DEFAULT when present

The auto-processor invokes this skill **scoped to one task**: `/perceptor tasks
<TARGET_ROOT> --task <id>`. When `--task <id>` is in `$ARGUMENTS`:

- Act on **ONLY** that task — do NOT scan, propose, or apply any other queue entry.
- **Resume from its existing context, don't rediscover it.** Read just what that task
  needs: for a `proposed`/`error` task the user just replied to → its current
  `artifact` (the diff/impact it carries) + `messages[]` (the conversation) + the
  file(s) that diff touches, then refine from
  there. For a fresh `pending` task → its `from`/`to`/`spec` + the specific file(s) it
  names. Skip whole-repo exploration unless the task genuinely spans unknown files.
- This keeps each run cheap and fast (fewer tokens, less latency) and means chat
  replies continue the same proposal instead of starting over.
- **Resumed session:** the auto-processor reuses ONE Claude session per task, so on a
  follow-up run you already hold this task's prior context (the diff/reasoning you
  built, files you read). Trust that memory — re-read ONLY what changed (the task's new
  status, the latest `user` message) instead of re-exploring files you've already seen.
  Never let resuming lower your understanding: if you're missing something, read it.
- Still obey §1b preferences, §1c gates, §3 per-type rules, language (§"Output
  language"), diff format, and the auto-processor status contract — just for that one task.
- If no `--task` is given (manual/dev invocation), fall back to processing the whole
  queue as described below.

## 1b. Load the coding preferences (do this before proposing any code)

**`<TARGET_ROOT>/.perceptor/coding-preferences.json` is the authoritative standard** —
the user fills it in the **⚙ Prefs** form and Claude MUST obey it. Read it first. Shape:
`{ primaryLanguage, additionalLanguages[], naming{ classCase, methodCase, variableCase,
constantCase, fileNaming, booleanPrefixes[], testPattern, allowAbbreviations },
architecture{ dependencyInjection, layering[], packaging, patterns[], errorHandling },
qualityGates{ maxTimeComplexity, forbidNPlusOneQueries, requireImpactAnalysis,
forbidCodeDuplication, maxMethodLines, enforceSingleResponsibility }, commentsPolicy }`.

- Treat every field as a hard constraint on the code you generate or move. Naming,
  `dependencyInjection`, `errorHandling`, `patterns`, `commentsPolicy`, `maxMethodLines`
  all come straight from this file — do not substitute your own defaults.
- **Apply the language's elite/professional idioms** for `primaryLanguage` (and any
  `additionalLanguages`): e.g. TypeScript → strict types, no `any`/`unknown` leaking past
  a boundary, discriminated unions, readonly; Java → records/sealed types, Optional at
  boundaries, constructor injection; C# → nullable refs, expression-bodied members, LINQ.
- **TypeScript engineering standard (non-negotiable for TS code you generate):**
  - **Types**: data shapes are `type`; `interface` ONLY for behavior contracts a class
    implements. No optional keys (`?`) and no `undefined` for domain types — model absence
    with `null` or a discriminated union. No `[key: string]: unknown` grab-bags. Every
    function/command has a *determined* return type — never `unknown` in a definition
    (generics like `Command<Result>` bind it); `unknown` is allowed only at a genuine
    dynamic boundary (e.g. a registry keyed by a runtime string).
  - **Explicit return types on every method/function** (`: Promise<X>`, `: Foo[]`, …) —
    don't rely on inference; annotate (even on a generic command's `handle`, e.g.
    `: ReturnType<CoreService["method"]>`).
  - **Naming**: a local/field is the lowerCamelCase of its type (`ParsedCode parsedCode`,
    `ParsedClass parsedClass`) — no vague `parsed`/`data`/`result`, no abbreviations; name
    the type itself meaningfully too.
  - **Errors**: methods THROW domain exceptions (a `DomainException` base + one concrete
    subclass per case, each carrying an `ErrorCode`); never return `{ ok: boolean }` /
    `Result` / `isSuccess`. A single global funnel at the transport boundary maps a thrown
    value → an `ErrorResponse` (domain → its code; anything else → INTERNAL_ERROR, no raw
    stack/message leaked), and wraps success data in a `SuccessResponse` envelope
    (`{ success: true, data }` | `{ success: false, error }`, both with `traceId`).
  - **tsconfig** for any new TS project: extend this canonical strict template — `"strict": true`
    plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
    `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
    `noPropertyAccessFromIndexSignature`, `allowUnreachableCode: false`, `allowUnusedLabels:
    false`, `isolatedModules`, `forceConsistentCasingInFileNames`. (Reference implementation:
    `Perceptor/tsconfig.base.json` + `service/{api,exception}` + `service/commands`.)
- If the file is **absent**, fall back to inferring the standard from the actual source
  + config (`package.json`, `build.gradle`, `*.csproj`, lint configs) and the user's
  `CLAUDE.md`/memory — but prefer the file whenever it exists.
- Two checks remain non-negotiable: **method naming** and **dependency management** must
  match `coding-preferences.json` (and, failing that, the repo's existing pattern).

## 1c. Hard quality gates (from `qualityGates` — enforce on every change)

- **Time complexity**: never exceed `maxTimeComplexity` (default `O(n)`). **No nested
  `for` loops — ever.** Flatten parent→child traversal into one `map`/`flatMap` pipeline
  + `forEach`, pull each item's work into a guard-style method, and resolve/dedup via a
  `Map`/`Set` (O(1) get/set) — never re-scan a collection (no `.find`/`.includes` in a
  loop). State the resulting complexity in the impact notes — **honestly**: never label a
  nested/quadratic loop as O(1)/O(n). If an algorithm is genuinely all-pairs/n-body
  (O(n²)), say so plainly and note the real fix (e.g. a quadtree); don't hide it behind
  functional syntax.
- **Query performance** (`forbidNPlusOneQueries`): no N+1 — batch/join/`IN`-query, project
  only needed columns, lean on indexes. Flag any query the change adds.
- **No duplication** (`forbidCodeDuplication`): reuse existing helpers/abstractions; if you
  would copy logic, extract it instead. Before adding code, grep for an existing equivalent.
- **Impact on existing structure**: trace call sites and shared state the change touches;
  a change that ripples must be reported in the impact notes, not silently absorbed.

## 1d. Code smell detection (language-agnostic, enforce on edit-behavior / add-behavior / request)

When reading code for a proposal, scan for these structural smells. If found,
include the refactoring in the diff — do not preserve the smell. Report each
detection in impact notes (e.g. "Strategy smell: 3 if blocks on `type`").

### Strategy smell
**Detect:** 3+ `if`/`else if`/`switch` branches checking the same discriminator variable.
**When to apply polymorphism:** the branches share the same input shape but differ in behavior —
each branch is a self-contained operation, not a simple value mapping or guard check.
**Refactor:** Enum discriminator + strategy interface + `Map<Enum, Strategy>` resolver.
```typescript
// BEFORE — smell: 3 branches on payload.type (magic strings, no enum, no polymorphism)
if (payload.type === 'email') { sendEmail(payload) }
else if (payload.type === 'sms') { sendSms(payload) }
else if (payload.type === 'push') { sendPush(payload) }

// AFTER — enum + strategy interface + typed resolver
const enum NotificationType { Email = 'EMAIL', Sms = 'SMS', Push = 'PUSH' }

type NotificationPayload = { readonly type: NotificationType; readonly recipient: string; readonly content: string };

interface NotificationStrategy { send(payload: NotificationPayload): void }

class EmailStrategy implements NotificationStrategy {
  send(payload: NotificationPayload): void { /* ... */ }
}
class SmsStrategy implements NotificationStrategy {
  send(payload: NotificationPayload): void { /* ... */ }
}
class PushStrategy implements NotificationStrategy {
  send(payload: NotificationPayload): void { /* ... */ }
}

const notificationStrategyMap: ReadonlyMap<NotificationType, NotificationStrategy> = new Map([
  [NotificationType.Email, new EmailStrategy()],
  [NotificationType.Sms, new SmsStrategy()],
  [NotificationType.Push, new PushStrategy()],
]);

function resolveNotificationStrategy(type: NotificationType): NotificationStrategy {
  const strategy = notificationStrategyMap.get(type);
  if (!strategy) throw new UnsupportedNotificationTypeException(type);
  return strategy;
}

resolveNotificationStrategy(payload.type).send(payload);
```

### Template Method smell
**Detect:** 2+ classes repeating the same step sequence with minor per-step variation.
**Refactor:** Abstract base with the shared sequence; `protected abstract` hooks for varying steps.
```typescript
// BEFORE — OrderProcessor and RefundProcessor both: validate → calculate → persist → notify
// AFTER
abstract class TransactionProcessor<T extends Transaction> {
  process(transaction: T): void { this.validate(transaction); this.calculate(transaction); this.persist(transaction); this.notify(transaction); }
  protected abstract validate(transaction: T): void;
  protected abstract calculate(transaction: T): void;
  // persist and notify can be concrete if identical
}
```

### Factory smell
**Detect:** `if`/`switch` creating different object types based on a discriminator.
**Refactor:** Enum discriminator + `ReadonlyMap<Enum, () => T>` factory registry.
```typescript
const enum FileType { Csv = 'CSV', Json = 'JSON', Xml = 'XML' }

interface FileParser { parse(content: string): ReadonlyArray<Record<string, unknown>> }

const fileParserFactory: ReadonlyMap<FileType, () => FileParser> = new Map([
  [FileType.Csv, () => new CsvParser()],
  [FileType.Json, () => new JsonParser()],
  [FileType.Xml, () => new XmlParser()],
]);

function createFileParser(type: FileType): FileParser {
  const factory = fileParserFactory.get(type);
  if (!factory) throw new UnsupportedFileTypeException(type);
  return factory();
}
```

### SRP violation
**Detect:** Single method mixing unrelated responsibilities (validation + persistence + notification).
**Refactor:** Split into focused methods, each with one responsibility; orchestrate from a coordinator.

### Primitive obsession
**Detect:** 3+ primitives that always travel together (e.g. `street, city, zip`).
**Refactor:** Wrap in a value object type.
```typescript
// BEFORE: createUser(name: string, street: string, city: string, zip: string)
// AFTER
type Address = { readonly street: string; readonly city: string; readonly zip: string };
createUser(name: string, address: Address): void
```

### Feature envy
**Detect:** A method mostly accesses another class's fields/getters rather than its own.
**Refactor:** Move the method to the class it envies, or extract the accessed data into a method on that class.

### Long parameter list
**Detect:** 4+ parameters on a single method.
**Refactor:** Group into a parameter object type with `readonly` fields and enum where applicable.
```typescript
const enum SortOrder { Asc = 'ASC', Desc = 'DESC' }

type SearchCriteria = {
  readonly query: string;
  readonly page: number;
  readonly size: number;
  readonly sortBy: string;
  readonly order: SortOrder;
};

// BEFORE: search(query: string, page: number, size: number, sortBy: string, order: SortOrder)
// AFTER
function search(criteria: SearchCriteria): SearchResult { /* ... */ }
```

### Code duplication
**Detect:** Near-identical logic in 2+ locations.
**Refactor:** Extract into a shared helper, utility, or base-class method. Never copy-paste.

**When to prefer polymorphism over conditionals:**
- Each branch has **distinct behavior** (not just a value lookup — a value lookup is a simple `Map.get()`, not a strategy).
- The set of cases is **likely to grow** (open/closed principle — new case = new class, no existing code touched).
- The branch logic is **complex enough** (3+ lines per branch) — trivial one-liners stay as a map or ternary.
- Do NOT apply polymorphism to: simple boolean guards, null checks, feature flags, or value mappings.

**Type strictness rules (non-negotiable in examples and generated code):**
- **Enums over magic strings**: every discriminator (`type`, `status`, `role`, `kind`) MUST be a `const enum` — never bare string literals in conditionals or map keys.
- **`readonly` on every data type field** — mutable domain types are a code smell.
- **`ReadonlyMap` / `ReadonlyArray`** for lookup tables and collections that must not be mutated.
- **Explicit return types** on every function/method — no inference reliance.
- **Named resolver/factory functions** — never inline `map.get()` without a null guard and domain exception.

**Guard rules:**
- Apply only when the smell is **clear and unambiguous** — do not force a pattern on straightforward sequential logic.
- When `spec.description` explicitly asks to keep the current structure, respect it — note the smell in impact notes but do not refactor.
- These smells complement `coding-preferences.json` `patterns[]`; if the user listed a pattern there, treat it as a hard constraint.

## 1e. Framework-specific idioms (enforce when `preferredFramework` is set)

When `coding-preferences.json` has a `preferredFramework`, apply these mandatory
mechanics — code that ignores them is **not framework-native** and must be rejected.

### TypeScript frameworks

**NestJS**
- DI: `@Injectable()` + constructor injection via Nest IoC — never `new` a service.
  Every provider registered in its feature `@Module({ providers, controllers, exports })`.
- Routing: `@Controller` + HTTP decorators (`@Get`, `@Post`, `@Body()`, `@Param()`).
  No raw `req`/`res` — use typed DTOs.
- Validation: `class-validator` decorators on DTO classes (`@IsString()`, `@IsNotEmpty()`,
  `@ValidateNested()`). Pipe `ValidationPipe({ whitelist: true, transform: true })` globally.
  Never validate manually in a controller.
- Error handling: domain exceptions extend `HttpException` or use a global `@Catch()`
  `ExceptionFilter` that maps domain errors → HTTP status + response envelope.
  No try/catch in controllers.
- Cross-cutting: auth via `@UseGuards()`, logging via `@UseInterceptors()`, caching via
  `@CacheInterceptor` — never inline in method body (SRP).
- Data access: repository pattern with `@InjectRepository()` (TypeORM) or custom
  repository class. Service never calls raw query builder directly.
- Config: `@nestjs/config` + `ConfigService` injected — no `process.env` reads in code.

**Express**
- Middleware-based: `app.use()` chain for auth/logging/error. Router per feature.
- DI: manual or `tsyringe`/`inversify` container — constructor injection, no service locators.
- Error handling: centralized error middleware `(err, req, res, next)` as last middleware.
  Controllers throw, never `res.status().json()` errors inline.
- Validation: `joi`, `zod`, or `express-validator` middleware — never validate in handler.
- Typed request/response: extend `Request` type or use typed wrapper — no `any` on `req.body`.

**Next.js**
- App Router: `app/` directory, `page.tsx` + `layout.tsx` + `loading.tsx` + `error.tsx`.
  Server Components by default; `'use client'` only when state/effects needed.
- Data fetching: `async` Server Components with `fetch()` + revalidation, or Server Actions
  for mutations. No `useEffect` for data loading.
- API routes: `app/api/*/route.ts` with typed `NextRequest`/`NextResponse`.
- Caching: `unstable_cache` / `revalidateTag` / `revalidatePath` — explicit strategy, no
  implicit stale data.

**Angular**
- DI: `@Injectable({ providedIn: 'root' })` or module-scoped. Constructor injection only.
- Reactive: `RxJS` observables in services, `async` pipe in templates — minimal `.subscribe()`.
- Modules: feature modules with lazy loading (`loadChildren`). Shared module for common components.
- Forms: Reactive Forms (`FormGroup`, `FormControl`, validators) over Template-driven.
- HTTP: `HttpClient` via `HttpInterceptor` for auth/error. Never raw `fetch`.
- State: `NgRx` or `Signal`-based state — no service-level mutable fields as "store."

**React**
- Components: function components only. Custom hooks for reusable logic.
- State: `useState`/`useReducer` local; `Zustand`/`Redux Toolkit`/`Jotai` for shared.
  Never prop-drill more than 2 levels — extract context or state hook.
- Side effects: `useEffect` with explicit deps, cleanup function for subscriptions.
  Data fetching via `TanStack Query` / `SWR` — not raw `useEffect + fetch`.
- Types: props as `type` (not interface), `React.FC` discouraged — use explicit return.
- Rendering: memoize expensive renders (`React.memo`, `useMemo`, `useCallback`) only
  when profiler confirms need — no premature optimization.

**Vue**
- Composition API (`<script setup>`) over Options API. `ref`/`reactive`/`computed`.
- Composables: extract reusable logic into `use*` functions (equivalent of custom hooks).
- Routing: `vue-router` with typed route params. Guards for auth.
- State: `Pinia` stores per feature domain — no global Vuex.
- Props: `defineProps<T>()` with TypeScript generics — full type safety.

### Java frameworks

**Spring Boot**
- DI: `@Service`/`@Repository`/`@Controller` stereotypes, constructor injection (single
  constructor = no `@Autowired` needed). Never field injection.
- Layering: Controller → Service → Repository. Controller never calls repository directly.
- Validation: `@Valid` on `@RequestBody` DTO, Bean Validation annotations (`@NotNull`,
  `@Size`). Never validate in service.
- Error handling: `@RestControllerAdvice` + `@ExceptionHandler` per domain exception →
  `ProblemDetail` (RFC 7807). No try/catch in controllers.
- Data access: Spring Data JPA `JpaRepository` interfaces. Custom queries via `@Query`.
  Projections for read-only views. `@Transactional` on service methods.
- Config: `@ConfigurationProperties` bound record/class — no `@Value` scattered in code.
- Security: Spring Security `SecurityFilterChain` bean — no manual auth checks in methods.

**Quarkus**
- CDI: `@ApplicationScoped`/`@RequestScoped` beans, constructor injection. `@Inject` only
  when multiple constructors.
- Reactive: `Mutiny` (`Uni<T>`/`Multi<T>`) for non-blocking. `@Blocking` for imperative.
- Data: Panache (`PanacheEntity` active record or `PanacheRepository<T>` pattern).
- Config: `@ConfigProperty` or SmallRye Config `@ConfigMapping` interface.
- REST: RESTEasy Reactive annotations, `@ServerExceptionMapper` for error mapping.

**Micronaut**
- DI: compile-time AOP, `@Singleton`/`@Prototype`, constructor injection. No reflection.
- HTTP: `@Controller` + `@Get`/`@Post`, `@Body`, `HttpResponse<T>` typed returns.
- Data: Micronaut Data `@Repository` interfaces with compile-time query generation.
- Config: `@ConfigurationProperties` or `@EachProperty` for repeatable config.

**Jakarta EE**
- CDI: `@ApplicationScoped`/`@RequestScoped`, `@Inject` constructor. `@Produces` for factories.
- REST: JAX-RS `@Path`/`@GET`/`@POST`, `ExceptionMapper<T>` for error mapping.
- Data: JPA `EntityManager` or repository pattern. `@Transactional` on service.
- Validation: Bean Validation `@Valid` + constraint annotations on DTOs.

### C# frameworks

**ASP.NET Core**
- DI: `builder.Services.AddScoped/Transient/Singleton<IService, Service>()`. Constructor
  injection. Interface per service for testability.
- Routing: `[ApiController]` + `[Route]` + `[HttpGet]`/`[HttpPost]`. Typed `ActionResult<T>`.
- Validation: `FluentValidation` or Data Annotations on request DTOs. `[ApiController]`
  auto-validates — no manual `ModelState` checks.
- Error handling: global `IExceptionHandler` or middleware. `ProblemDetails` (RFC 7807).
  Domain exceptions mapped centrally, no try/catch in controllers.
- Data: EF Core `DbContext` + repository pattern. `IQueryable` projections for reads.
  `SaveChangesAsync` unit-of-work. Migrations managed.
- Config: `IOptions<T>` pattern with strongly-typed config classes. No raw `IConfiguration` reads.
- Middleware: `app.UseAuthentication()` / `app.UseAuthorization()` pipeline — never inline.

**Blazor**
- Components: `.razor` files, `@inject` for DI, `[Parameter]` for props.
- State: cascading parameters or `Fluxor`/scoped services — no static mutable state.
- Forms: `EditForm` + `DataAnnotationsValidator` + `ValidationSummary`.

**.NET MAUI**
- MVVM: `ViewModel` via `CommunityToolkit.Mvvm` (`[ObservableProperty]`, `[RelayCommand]`).
  Shell-based navigation. DI via `MauiProgram.CreateMauiApp()`.

**Entity Framework**
- `DbContext` per unit-of-work, `DbSet<T>` per aggregate root. Owned types for value objects.
  Fluent API configuration in `IEntityTypeConfiguration<T>`. Migrations via `dotnet ef`.
  No lazy loading — explicit `Include()` or projection. Always async (`ToListAsync`, etc.).

### Go frameworks

**Gin**
- Routing: `router.Group()` per feature, `c.JSON()`/`c.ShouldBindJSON()` for typed I/O.
- Middleware: `gin.HandlerFunc` for auth/logging/recovery. `c.Set()`/`c.Get()` for context values.
- Error handling: custom `AppError` struct, recovery middleware catches panics → JSON error.
- DI: manual struct injection (Go has no IoC container) — pass dependencies via constructor functions.

**Echo**
- Routing: `e.Group()`, `echo.Context` for request/response. `c.Bind()` for typed input.
- Middleware: `echo.MiddlewareFunc`, built-in `middleware.Logger()`, `middleware.Recover()`.
- Error handling: `echo.HTTPErrorHandler` centralized. Return `echo.NewHTTPError()`.
- Validation: `go-playground/validator` with `echo.Validator` interface.

**Fiber**
- Routing: `app.Group()`, `c.BodyParser()` for typed input. `fiber.Ctx` for context.
- Middleware: `fiber.Handler`, built-in `logger`, `recover`, `cors`.
- Error handling: `app.ErrorHandler` centralized. Return `fiber.NewError()`.

**Chi**
- Routing: `chi.NewRouter()`, `chi.URLParam()` for path params. Standard `http.Handler`.
- Middleware: `chi.Use()`, compose via `chi.Chain()`. Standard `net/http` middleware compatible.
- DI: manual struct injection — chi is minimal, no magic.

**Gorilla Mux**
- Routing: `mux.NewRouter()`, `mux.Vars()` for path params. Standard `http.Handler`.
- Middleware: `mux.MiddlewareFunc` or standard `http.Handler` wrapping.
- Note: Gorilla is archived — for new projects recommend Chi or standard library `net/http`.

**Guard rules:**
- These idioms override generic language conventions when the framework has a specific way.
- If the repo already uses the framework in a particular style (e.g. field injection despite
  constructor being recommended), note it in impact notes but follow the framework best practice.
- When `preferredFramework` is empty or absent, skip this section entirely.

## 2. Read the queue

Read `<TARGET_ROOT>/.perceptor/pending-actions.json` (array of task objects).
Common fields: `{ id, type, status, artifact, messages[], createdAt, updatedAt }`, where
`artifact` is a discriminated union — `{ kind: "none" }` until a run proposes, then
`{ kind: "proposed", diff, impact }`, and `{ kind: "applied", diff, impact, commitMessage }`
once applied (the old flat `diff`/`impact`/`commitMessage` fields live here now). The
endpoints and `spec` are **shaped by `type`** (no nullable catch-all bag):

- `move-behavior` → `from {class,file,behavior}`, `to {class,file}` (no spec)
- `add-behavior` → `from {class,file}`, `spec {name,description,signature,errorHandling}`
- `edit-behavior` → `from {class,file,behavior}`, `spec {description,signature,line,endLine}`
- `create-file` → `from {dir}`, `spec {name,description}`
- `create-folder` → `from {dir}`, `spec {name}`
- `describe-behavior` → `from {class,file,behavior}`, `spec {line,endLine,flowOutline}`
- `request` → no `from`/`to`; `spec {description}`

Paths are relative to `<TARGET_ROOT>`.

## 3. Act per task status

For every `pending` task, **propose** (do NOT edit code yet); for every `approved`
task, **apply** the real edit (never commit — the user commits).

**`move-behavior`**
- Propose: read `from.file`/`to.file`, locate `from.behavior` in `from.class`,
  plan the move into `to.class` (body, imports, call sites). Build a unified diff.
- Apply: remove the method from `from.file`, add it to `to.file`, fix
  imports/visibility/call sites.

**`add-behavior`**
- Propose: read `from.file`, design a new method on `from.class` that satisfies
  `spec.description` (use `spec.name`/`spec.signature` if given, otherwise choose
  meaningful ones). Reuse existing injected dependencies where natural; do NOT add
  new dependencies or runtime null-checks unless asked. Build a unified diff.
- **Error handling** (`spec.errorHandling`):
  - `mode:"throw"` → on not-found/invalid the method MUST throw the business
    exception in `spec.exception` (e.g. `OrderNotFoundException`). If that exception
    type doesn't exist, create it following the repo's exception conventions (base
    class, package/folder, naming). The return type should be the non-nullable
    domain type (e.g. `Order`, not `Order | undefined`).
  - `mode:"nullable"` → return null/undefined as requested.
  - `mode:"default"` → follow the repo profile; for **service-layer lookups prefer
    throwing a domain exception over returning null/undefined** (returning
    null/undefined from a service is the anti-pattern to avoid).
- Apply: insert the method into `from.class` (+ any imports / new exception file it needs).

**`edit-behavior`**
- Propose: read `from.file` lines `spec.line`–`spec.endLine` (the current method),
  plan the change per `spec.description` (and `spec.signature` if given). Build a diff
  of just that method (+ updated call sites if the signature changes).
- Apply: modify the method in place; update call sites if the signature changed.

**`create-file`**
- Propose: design the file `from.dir`/`spec.name` from `spec.description`, following
  repo conventions (class/interface, imports, DI). Build a diff (new file).
- Apply: create the file (and parent dirs). If it's wired into something (e.g. a
  module/index), note it but don't auto-wire unless asked.

**`create-folder`**
- Propose: just state the folder to create (`from.dir`/`spec.name`); risk low.
- Apply: `mkdir -p` the folder. (Most VCS ignore empty dirs — mention this; if the
  user wants it tracked, suggest adding a file.)

**`request`** (free-form Chat requirement)
- Propose: read `spec.description`. Explore the repo to find where the requirement
  belongs (the right class/layer/feature). Design the change end-to-end across every
  file it touches (new files, edits, call-site updates), obeying §1b preferences and
  the §1c quality gates. Build ONE unified diff spanning all affected files. Set a
  terse `{role:"claude"}` message summarising the approach and any open question.
- If the requirement is ambiguous, DON'T guess: write a `clarify` result (`{ "kind":
  "clarify", "messages": [your one clarifying question] }`) — no diff. The task stays
  put; the user replies in the Chat tab and the run re-triggers, then you refine.
- Apply (on `approved`): make every edit in the diff, create any new files/dirs,
  update call sites, keep the repo compiling. Set `commitMessage`.

**`describe-behavior`** (method explanation, §3c) — **FAST PATH, read-only**
- This is a read-only, no-diff job. **Do the minimum I/O:** read ONLY `from.file` lines
  `spec.line`–`spec.endLine` (a single ranged Read — not the whole file, not the repo).
  Do NOT load `coding-preferences.json`, do NOT run quality gates, do NOT compute impact,
  do NOT build a diff. Speed matters — but the explanation must be **complete and accurate**.
- **Use `spec.flowOutline` as the authoritative control-flow skeleton (token-optimized).**
  The analyzer already extracted the method's structure deterministically (no Claude) and
  hands it to you as a compact indented outline — `input:` params, `call`/`await
  receiver.callee(args) -> var`, `if <cond>:` / `else:` with their work nested, `return …`,
  `throw …`. **Do NOT re-derive the control flow** — it is given. Your job is to add the
  *meaning* on top: narrate the method **branch-by-branch**, saying for each decision what it
  checks in plain language and what happens in each case (which calls fire, what it returns or
  throws). When the outline is present, lean on it and keep the ranged source read minimal —
  just enough to name the domain operations precisely. (`flowOutline` may be empty for a
  trivial method with no branches/calls; then explain from the source alone.)
- Read the method body in that range, then write a faithful, COMPLETE explanation —
  not a vague one-liner. Following the `flowOutline` order, cover the meaningful things the
  method actually does: its inputs, each significant step/branch (validations and guard
  checks, external/service calls, DB reads & writes and other side effects, error handling),
  and what it returns in each path. Mention the concrete domain operations you see (e.g.
  "when the route is restricted it logs an audit entry, then charges a toll if there are more
  than two stops") — never omit a real step. Be precise: describe ONLY what the code does,
  never invent behaviour that isn't there.
- Format: 2–5 short sentences (or terse "•" bullet lines for a long method), plain prose,
  no code fences, no fluff, in the §"Output language" locale.
- Report it with the `described` result:
  `{ "kind": "described", "summary": { "file": "<from.file>", "behavior": "<from.behavior>",
  "text": "…" }, "messages": [] }`. Never a diff. The host writes the summary into
  `behavior-summaries.json` and marks the task applied/dismissed — do NOT write that
  file yourself (parallel summaries race).
- A service that "can't find" something should fail loudly with a
  meaningful domain exception, not silently return null/undefined. Match the repo's
  existing exception hierarchy and naming.

## Impact analysis (set on every proposal)

Before proposing, work out the blast radius and set the task's **`impact`**:
`{ "risk": "low|medium|high", "notes": ["…", "…"] }`.

- Cover: call sites affected (how many / which files), behavioral differences vs
  before (e.g. "returned undefined → now throws OrderNotFoundException; 2 callers
  must handle it"), public-API/breaking changes, compile risk, new files created.
- When the change adds logic, state its **time complexity** (e.g. "lookup O(1) via Map")
  and confirm it's within `maxTimeComplexity`; if it adds/affects a **query**, note its
  cost and that it's not N+1; if it could **duplicate** existing logic, note what you
  reused instead. Skip whichever dimension doesn't apply — don't pad.
- **Notes MUST be terse** — 1 short sentence each, max ~3 notes. No paragraphs, no
  hand-holding. The user reads these at a glance to spot risk. If they want more,
  they ask in the task chat and THEN you explain in depth.
- Risk: `high` if behavior/contract changes or many callers; `medium` if a few
  callers or a new exception type; `low` if isolated/additive.

To propose: write a `proposed` result (`diff` + `impact` + a terse `claude` message).
To apply: an `applied` result (`diff` + `impact` + **`commitMessage`** + message), then
suggest "Re-analyze". On any blocker: an `error` result with a message explaining it.
Everything goes into the ONE result file by `kind` (§"Result file contract") — never
edit `pending-actions.json` yourself.

## Result file contract (STRICT — how you report back)

You report your outcome by writing exactly one JSON file, your task's own
`<TARGET_ROOT>/.perceptor/results/<id>.json` (create the `results/` dir if needed).
**This is the ONLY file you write to report progress** — never edit
`pending-actions.json` or `behavior-summaries.json` (the host owns those; concurrent
runs would corrupt them). The file is **discriminated by `kind`** — pick the one
outcome and write exactly its fields (no "set-or-leave" nullable bag):

```json
// proposed (pending → proposed): you built a diff for review
{ "kind": "proposed", "diff": "<unified diff>", "impact": { "risk": "low|medium|high", "notes": ["…"] },
  "messages": [{ "role": "claude", "text": "…", "at": "<iso>" }] }
// applied (approved → applied): you made the edits
{ "kind": "applied", "diff": "<unified diff>", "impact": { }, "commitMessage": "feat: …",
  "messages": [ ] }
// described (describe-behavior only): complete plain-English method explanation, no code change
{ "kind": "described", "summary": { "file": "…", "behavior": "…", "text": "…" }, "messages": [] }
// error: you hit a blocker and couldn't advance
{ "kind": "error", "messages": [{ "role": "claude", "text": "<what blocked you>", "at": "<iso>" }] }
// clarify (request only): you need one answer before proposing
{ "kind": "clarify", "messages": [{ "role": "claude", "text": "<your one question>", "at": "<iso>" }] }
```

- Write it ONCE, as your final action for the task. `messages` are APPENDED to the
  task's thread (only your new `claude` replies — never resend the user's). The host
  merges this in (sets status, the `artifact`, etc.) and deletes the file.
- You still READ `pending-actions.json` for the task's spec, current `artifact`
  (diff/impact), and conversation. You just never WRITE it.

## Output language (STRICT — full-stack consistency)

Read `<TARGET_ROOT>/.perceptor/locale.json` (`{ "locale": "en" | "tr" }`). **Every piece
of text you generate MUST be in that locale** — task `messages`, `spec.description`,
`impact.notes`, `commitMessage`, and behavior summaries. The UI chrome and your text
must never be a mix of languages. If the file is missing, match the user's language.
(`commitMessage` still follows the repo's commit convention; only its prose is localised.)

## Diff format (STRICT — applies to every diff-producing type)

The `diff` field MUST be a **valid unified diff**, never a prose summary. The UI
parses it into per-file, per-hunk +/- views; free-form text renders as an
unstructured blob and breaks the review flow. For every affected file emit:

```
--- a/<relative/path>
+++ b/<relative/path>
@@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@
context line
-removed line
+added line
```

- New file: `--- /dev/null` then `+++ b/<path>` with all lines as `+`.
- Deleted file: `+++ /dev/null`, all lines `-`.
- **Rename** (e.g. `index.ts` → `main.ts`): use git rename headers
  `diff --git a/<old> b/<new>` / `rename from <old>` / `rename to <new>`, plus a
  normal hunk for any content change. Do NOT describe a rename in prose.
- Paths are relative to `<TARGET_ROOT>`. One diff may span many files — concatenate
  their unified-diff blocks. No commentary lines outside the diff syntax.

## Commit handling (STRICT)

- **NEVER commit. NEVER push. EVER.** All changes stay in the working tree; the
  user reviews and commits from VS Code themselves.
- On apply, set the task's `commitMessage` to a ready-to-use message that follows
  THIS repo's commit convention (infer style from `git log --oneline -20`:
  conventional-commits `feat:/fix:/refactor:` vs plain). Example for adding a
  method: `feat: add findById to OrderRepository`.
- The message MUST NOT contain any `Co-Authored-By`, "Anthropic", "Generated with
  Claude", or similar footer/attribution. Just the plain message in the repo's style.
- **`proposed` / `applied` / `error` with new `user` messages:** read the user's
  message, reply with a `claude` message, and re-propose or re-apply as needed.
  - **Region-tagged messages:** a user message that starts with `[<file> @@ -.. +.. @@]`
    is a quick question/edit scoped to that exact hunk (sent from the Changes tab). Focus
    your answer/revision on that file + hunk; update the `diff` for that region and keep
    the rest of the proposal intact unless the user asks for more.
- **`rejected`:** skip.

## 3b. Verify after applying

If the repo has an obvious typecheck/build (e.g. `tsc --noEmit`, `./gradlew
compileJava`), run it and report pass/fail in the task message. Never leave the
repo in a non-compiling state; if you can't fix it, revert and mark `error`.

## 4. Report

Summarize to the user (in the §"Output language" locale): how many tasks proposed /
applied / errored, and what needs their review. Never auto-commit; leave changes local.

## Auto-processor contract (when invoked headlessly)

The extension host has an optional, default-OFF "Auto-process" toggle. When on, a
host-side scheduler runs up to **3 tasks in parallel**, each as its own
`claude -p "/perceptor tasks <repo> --task <id>"` (this skill, scoped to one task —
§1a) on its own reused session. Two runs are never scheduled on tasks whose diffs
touch the same file, so your edits never collide. The host owns `task.lock` and the
queue file — DON'T touch them. **You MUST advance the task's status** by writing your
result file (`pending`→`proposed`, or `approved`→`applied`/`error`): the auto-processor
gives each status exactly one headless attempt, so a task you leave on its original
status will NOT be retried (token-conservative) and will sit in the "awaiting" banner
for the user. Always finish by writing your `.perceptor/results/<id>.json`
(§"Result file contract").
