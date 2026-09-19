# 0003: Every package is layered domain / client / edge

Status: proposed, 2026-09-19.

The edge layer is `service` in a backend package and the SvelteKit shell in the web app; the first
two layers and the dependency direction are the same everywhere.

## Context

The system's code is spread over two apps and two packages, and most of it is either business logic
(which questions a PDF chapter contains, when a submission is waiting, what a valid commit is,
which screen comes next, what a plan file may be, everything the floorplan editor decides) or
wiring to something external (Cloud Storage, HubSpot, the environment, the browser, SvelteKit).
Nothing says where the line between the two runs, so it is drawn differently in every folder: the
worker's PDF generation is pure and driven by an interface it declares, while its run loop holds a
bucket client and the object names alongside the run logic; in the web app a rule can sit in a pure
module, in a rune store or in a `.svelte` file, with nothing to say which.

Where the line is unclear, two costs follow. Logic can only be exercised with a fake of whatever it
touches, and the wiring collects unit tests of its own — tests that assert that one call was
forwarded to another. Those tests pass whatever the system does, and they are what makes rewiring
expensive: the rewrite is small, the tests around it are not.

`docs/code/standards.md` already asks for pure, injectable logic. This ADR is the shape that rule
takes in a folder tree, on both sides of the system, and what it means for tests.

## Decision

Every package and every app is organised in three layers: a core, the outside world, and a thin
edge that exposes the package and wires it together.

- **`domain`** — the business logic, and the only place it lives. Reading the components of
  `domain` is reading the features. It depends on nothing outward: no SDK, no `fetch`, no
  filesystem, no environment, no framework. Its only permitted outside import is
  `@urban-moon/domain-data` (schemas, catalog, limits, types) — see ADR 0001. When it needs the
  outside world it declares the interface it needs and uses that.
- **`client`** — the implementations of those interfaces: storage, HTTP APIs, the browser's
  persistence and platform APIs, the clock, ids, reading configuration from the environment. A
  client knows one external thing and translates it to the shape `domain` declared. It holds no
  business rule.
- **the edge** — a thin facade that exposes the package's functionality outward, chaining domain
  components, plus a factory that builds it by constructing the clients and injecting them into
  domain. No logic, no branching on business rules. It is called `service` in a backend package;
  in the web app it takes the shape below.

The dependency direction is one way: the edge → `domain` and the edge → `client` (to build it),
`client` → the interfaces `domain` declares. `domain` imports neither of the other two.

`packages/domain-data` is the declared exception: it is the contract, not a component. It has no
layers and every `domain` may import it. `packages/bucket` is a client and only a client — it stays
its own package, as ADR 0002 has it, and grows no `domain` and no edge; a consumer's `domain`
declares what it needs of storage in its own words rather than importing `Bucket`.

### The edge in the web app

A SvelteKit app has no facade to call: it is entered by a user through a browser, not by a caller
through a function. Its edge does the same job under two names, following the framework's own shape
rather than one imposed on it.

- **`src/routes`** — SvelteKit's layer: pages, layouts, and the `+server.ts` endpoints, which are
  the facade for the app's own HTTP surface. This is where a screen is composed and where the
  clients are constructed.
- **`src/lib/ui`** — everything that renders and receives input, and the view state that binds the
  two: the components, the rune stores (`*.svelte.ts`), and framework-free renderers and input
  routers of the same nature — the floorplan engine's template, its DOM binding, its gesture and
  key routing, its plates and chips.

Both are the edge and both follow the edge rules, with three points particular to a UI.

- **The edge may hold state here; a `service` may not.** A UI has to: what the user is looking at,
  what is selected, what is in flight, what has been typed but not committed. What it may not hold
  is a *transition* — the decision of what the next state is. Stores keep values and call domain
  for every change.
- **The factory is the mount.** What a backend factory does at startup, the UI does where a screen
  or an editor is mounted: the route and `mountFloorplan()` construct the clients (storage, fetch,
  raster, clock) and hand them to domain. Below that point nothing reaches for a browser API on its
  own.
- **The text lives with the component.** Romanian wording is written where it is displayed, not in
  `domain`. Domain returns a state, a reason or a code; the component maps it to words. This is a
  deliberate break in domain's purity as a description of the features — see the consequences.

Domain in the web app is the same domain as anywhere: which screen comes next, whether a screen is
answered, what the chrome offers, whether a file may be added and why not, what a readback line is
made of, and the floorplan's model, geometry, edits, snapping, history and what is drawn expressed
as data. None of it imports Svelte, the DOM, `$app/*` or `$state`.

Two checks decide whether a piece is in the right layer. If Svelte were replaced tomorrow, would a
rule disappear with it? Then the rule is in the wrong layer. And if a `.svelte` file or a store
contains a condition a client of the studio would recognise as a rule of the product, it belongs in
`domain` and is called from there.

### Layout

The layers are top-level folders of a package's or an app's source: `src/domain`, `src/client`,
`src/service`. A layer folder holds its files directly; it gets subfolders only when it has enough
files that the flat list stops reading well (`src/domain/generation/...`). There is no layer suffix
on file names and no per-feature split above the layers.

In the web app the same holds under `src/lib` — `src/lib/domain`, `src/lib/client`, `src/lib/ui` —
with `src/routes` where SvelteKit puts it. A feature that spans layers is a subfolder of each layer
it appears in (`domain/floorplan`, `ui/floorplan`), not one `floorplan/` with layers inside it. The
layers are the top level everywhere; features are how a layer is subdivided.

### Tests

- `domain` is unit-tested heavily. It runs without fakes of infrastructure, because it has none.
- `client` is unit-tested where the test proves something real: how the external system behaves and
  how the client translates it — status codes, headers, the shapes it sends and parses, the known
  differences between the emulator and Google. `packages/bucket/src/bucket.test.ts` is the example,
  and `docs/code/testing.md` already relies on it. A client test asserts the translation, never that
  a call was forwarded.
- The edge gets no unit tests, in either shape. A `service` has nothing to assert but its own
  wiring: which components it chains and what its factory constructs. Routes and components have
  nothing to assert but their rendering and their bindings, and a test of those breaks on every
  redesign while proving nothing about the product. Both are covered by the end-to-end journeys in
  `e2e/` (`docs/code/testing.md`), which is where they are actually exercised: a real browser, a
  real drag, real bytes going to the bucket.
- The reason is not test count, it is rewrite cost. A unit test of a facade asserts the shape of the
  facade; it fails when the facade is rearranged even though the system still behaves, and it passes
  when the arrangement is wrong in a way only a real run shows.
- What the edge owes the journeys instead of tests is its **test ids**: they are the contract the
  specs hold it to, they stay stable across a redesign, and a ticket that adds a screen or a control
  names the ids it must carry.

### Enforcement

By review. A reviewer checks a diff's imports against this ADR; nothing in the toolchain sees a
layer violation. This is the cheapest enforcement and the weakest, and it is enough while the repo
is this size and every change is reviewed.

## Alternatives

- **Keep "pure and injectable" as a rule without a folder shape** (today). Rejected: it says what
  logic must be, not where it lives, so the boundary is redrawn per folder and nothing tells a
  reviewer that an import is in the wrong direction.
- **Two layers: domain and everything else.** Rejected: the facade and the factory then sit inside
  either domain (which stops being pure) or the clients (which stop being one-external-thing each),
  and the entry point of a package becomes hard to find.
- **Ports-and-adapters with a dedicated `ports` folder for the interfaces.** Rejected: an interface
  read far from the logic that uses it is another file to keep in sync; here the interface is part
  of what domain says it needs, so it lives with it.
- **Drop unit tests from clients as well as the facade.** Rejected: a client is where an external
  system's real behaviour is encoded — a status code, a header, a response shape, an emulator
  difference — and most of that cannot be observed from a journey, or only as a failure far from
  its cause. What does not earn its keep is asserting that one call was forwarded to another, and
  that is what a facade test is.
- **A layer suffix or a per-feature split above the layers** (`submission/domain`, `pdf.client.ts`).
  Rejected: with packages this small it multiplies folders, and the top-level layer folders are
  what makes a wrong import visible in a diff.
- **Force the name `service` on the web app's routes and components.** Rejected: a service is a
  facade a caller invokes and holds no state, and a UI is neither; the words of the rule would be
  false from the first store, and the first exception licences the rest. The framework's own shape
  is kept instead.
- **A fourth layer between domain and the components — presenters, view models, MVVM.** Rejected:
  in Svelte 5 the rune store already is that layer, and a second thin layer of objects that only
  reshape domain output is where rules quietly settle.
- **Group the front end by feature, with layers inside each feature** (feature-sliced design).
  Rejected: it reads well for one large feature and badly for a dozen small screens, it gives the
  app a different top level from the packages, and the core stops being one place that can be read
  end to end.
- **Keep the Romanian wording in domain**, as finished strings chosen by the rule that produces
  them. Rejected: it reads well in domain and badly everywhere else — the words a screen shows are
  then spread between the component and a module far from it, and every wording change touches the
  core. Simplicity of reading a screen won over purity of the core.
- **Enforce the direction with tooling**: a lint rule (`eslint-plugin-boundaries` or
  `no-restricted-imports` per layer folder), a test per package that reads import statements, or a
  check script in `scripts/`. All rejected for now: there is no ESLint in the repo, and an
  import parser of our own is a thing to maintain that catches what a reviewer catches anyway. If
  violations start landing, the test or the script is the cheap next step.

## Consequences

- Reading a package starts at `domain`, and the features are readable without any infrastructure in
  the way.
- Replacing an external system (another storage, another CRM, another PDF library) is a new client
  and no change in domain, and no test suite has to be rewritten with it.
- A redesign touches the edge only. The questions, the completeness rules and the floorplan do not
  move when the screens are redrawn, and their tests do not either.
- Unit tests concentrate where they prove something: the features in `domain`, the external
  behaviour in `client`.
- A mistake in the wiring is only caught by the e2e suite, which is slower and runs later than
  `npm test`. A ticket that adds or changes an edge must name the journey that covers it.
- The cover for the edge is a suite that does not exist yet: `e2e/` is still a backlog ticket.
  Until it runs, dropping an edge's unit tests leaves that wiring untested, so such tests go when
  the journey that replaces them exists, not before.
- **Keeping the text with the component costs domain its last claim to completeness.** A rule and
  the sentence the client reads because of it now live apart: adding a rejection reason, a hint or a
  readback line means a case in domain and a string in the component, two places instead of one, and
  the two can drift until a journey or a person notices. Domain stops reading as a description of the
  features in the client's own words. The floorplan engine works the other way today — `hintFor`
  returns finished Romanian — so under this rule it returns a hint state or reason that the UI maps
  to words, and `copy.ts` moves to the edge with the components that print it. What is bought is
  that a screen's words are in the screen: a wording change is one file, the ux docs describe what a
  component says, and nobody reads the core to find a label.
- Small packages pay for three folders where one file would do, and a package that is one layer
  (`packages/bucket`) stays flat rather than growing empty folders.
- Enforcement by review means a violation can live until someone notices it, and the rule holds
  exactly as well as reviewers are attentive.
- The web app's code no longer sits where SvelteKit conventions and most Svelte examples put it, and
  one feature is read across three folders.
