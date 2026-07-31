# Security audit fixes — 5 vulnerabilities → 0, verified

## Important context first
The audit you ran earlier was in the wrong directory
(`/workspaces/Loop`, not `/workspaces/Loop/loop_work`) — confirmed by
"Missing script: build", since only the real project has that script.
That's why it suggested downgrading to `next@9.3.3`, a version from
years before this app existed. Ran the real audit directly against your
actual project instead.

## What was actually wrong and what was fixed

**6 Next.js CVEs** (cache confusion, SSRF via rewrites, unbounded Server
Action payload, image-optimization DoS, unauthenticated Server Function
disclosure) — fixed by bumping `next` `16.2.9` → `16.2.12`, the actual
patched version. This is a small patch-level bump within the same
16.2.x line, not a breaking change.

**postcss path traversal** (arbitrary `.map` file disclosure) — this one
took real digging: `postcss` was directly pinned to `8.5.15` in *two*
places in `package.json` (`dependencies` and an `overrides` block),
which was overriding what `next` and `tailwindcss` would otherwise have
resolved to correctly. Bumped both pins to `8.5.25`, the latest version.

**sharp / libvips CVEs** (4 CVEs, high severity) — the trickiest one.
`next@16.2.12` itself still declares `sharp: "^0.34.5"` as an optional
dependency — the patched version (`0.35.x`) is outside what Next.js
itself currently asks for. Added a `sharp` override to force `^0.35.0`
regardless. Given this app processes user-uploaded images (nutrition
label scanning, holding-image AI import), leaving this unpatched felt
like a real risk, not a theoretical one — worth the override even though
it goes beyond what Next.js's own package.json specifies.

**uuid buffer bounds check** (moderate) — fixed by bumping `node-cron`
`^3.0.3` → `^4.6.0` (the only fix path npm offered). Checked first:
`node-cron` isn't imported anywhere in your actual application code —
confirmed dead weight in the dependency tree — so this bump carries
zero practical risk to anything your app actually does.

## Verification
```
npm audit
found 0 vulnerabilities
```
Also ran a full `tsc --noEmit` (still 0 errors) and an actual
`npm run build` afterward — compiled and type-checked successfully with
the new versions. The build's only failure was a missing-Supabase-env-var
error, which is just this sandbox not having real secrets configured
(same as always) — unrelated to these changes.

**One honest caveat:** I couldn't test actual image-processing behavior
end-to-end (no real Supabase/API access here), given the `sharp` version
jump goes beyond what Next.js itself currently declares. Worth keeping
an eye on the label-scanner and holding-image-import features specifically
after this deploys, just in case — though the build/compile success is a
good sign nothing structural broke.

## Files changed
```
package.json
package-lock.json
```
