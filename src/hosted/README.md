# Inactive hosted contract

This internal module parses inert hosted-image request, quote, job and artifact
data and computes state decisions. It has no package export, command, endpoint,
transport, storage, credential handling or provider adapter. Importing it performs
no filesystem or network operation. It does not activate a hosted Slopcamera
service or change direct Gateway generation. The package archive excludes this
prototype; it remains repository source until an explicit integration is ready.

The image shape is a limited prototype contract, not a selected product catalog.
It accepts one exact model/catalog revision, an authored prompt, up to four
finalized image references, dimensions, a count, an optional seed and an output
format. Unknown keys and opaque provider-option objects reject. Representation
ceilings do not offer a model, price or service limit. Money uses the nonnegative
integer micro-USD domain of credits-foundation 0.1.1; no foundation code or network
client is imported.

## Identity

`hostedEffectSha256` parses and normalizes explicit defaults, then uses the
portable bounded canonical-JSON implementation with a versioned hash domain.
Prompt whitespace and reference order remain meaningful. Invalid UTF-16,
oversized UTF-8 prompts, unsafe numbers, accessors and foreign keys reject.

A quote binds that effect hash and the catalog/policy revision. A separate
authorization hash binds the whole immutable quote, including quote identity,
customer ceiling and expiry. This avoids a circular quote/request hash. Changing
any authorization field under the same owner/environment/request-ID tuple is a
conflict; renewing authorization needs an explicit future protocol. Comparing an
existing identical request does not renew its quote or dispatch anything.

Authentication must supply a verified opaque `subjectKey`. The future job store
must enforce a unique `(environment, subjectKey, clientRequestId)` tuple and a
product-global unique job ID. `hostedHoldKey` namespaces that job ID and environment
under Slopcamera within the authority's 128-character bound. It does not use the
client's request ID as a product-global hold key. This module neither derives
token digests nor establishes authentication or database uniqueness.

## Decisions and external evidence

`reduceHostedJob` checks the expected version, worker fence and monotonic clock,
then returns a frozen next snapshot and an intent requirement. A future adapter
must conditionally commit that snapshot and append its evidence before acting.
An in-memory reducer does not implement persistence, worker leases, exactly-once
execution, an outbox or process recovery. The caller must also check that it still
owns the persisted fence immediately before an external action.

Generation, billing and artifact states are independent. Dispatch has a single
attempt and retains the exact proposed provider-request hash. After uncertain
dispatch, only reconciliation of that attempt is possible. A client timeout,
cancellation request or expired hold does not prove that the provider did no work.
Terminal cancellation needs either no dispatch or a provider-confirmed outcome.

Dispatch requires a confirmed hold no greater than the customer ceiling and a
deadline strictly before hold expiry after all supplied completion, artifact,
settlement-recovery and skew bounds. The qualification identity binds these
inputs to the effect hash, but a schema cannot establish the truth of a provider
completion bound. A future provider adapter must qualify it; a client timeout is
insufficient. The dispatch snapshot retains the combined bound, admission time,
completion deadline and latest permitted start. A future adapter must recheck the
current clock against `latestStartAtMs` after committing and immediately before
its one send. Loading an old dispatch intent after a restart grants no permission
to send; it requires reconciliation. This prototype also requires an unexpired quote before initial hold
and dispatch. It never replaces an expired hold after a dispatch.

Settlement and release after provider work require an injected decision under the
quote's exact policy revision. The reducer does not decide who pays for failed,
ambiguous or rejected output. Settlement cannot request more than either ceiling.
Malformed or uncertain billing keeps the original intent. Confirmed authority
responses retain actual `settled`, `released` or `expired` state; unexpected
terminal states, amount mismatch or excessive observed charges require operator
review. Exact terminal replay is harmless, including an over-ceiling result that
remains unresolved; conflicting terminal evidence rejects instead of overwriting
the prior result or clearing attention. The caller must preserve the rejected
evidence in its future append-only journal.

Artifact events represent externally verified evidence. Their parser checks job,
effect, MIME, count, dimensions, lengths and digests, but does not read media bytes
or verify uploads. A future adapter must validate ownership, physical bytes,
decoding and storage before issuing those events. An available artifact does not
infer provider success or settled billing. Expiration/deletion retains its manifest
and request identity; it never authorizes another generation. Media visibility
must also be checked against current time on each future read, independently of
whether an expiry event has been persisted.

## Qualification still required

The deterministic tests use fake data only. They do not establish live Credits
compatibility, token pickup/recovery, model behavior, provider idempotency, durable
storage, authenticated downloads, cost policy or deployed ownership. No active
adapter may be wired from these schemas alone. The credits authority/foundation
terminal-response and secret-free pickup gaps, product policy decisions and live
qualification requirements remain open in the implementation plan.
