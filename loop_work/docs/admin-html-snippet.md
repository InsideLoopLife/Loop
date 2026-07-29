# Admin HTML integration

Add the CSS in the `<head>` of `public/admin.html`:

```html
<link rel="stylesheet" href="/tier-entitlements-admin.css?v=2743">
```

Add the JS before `</body>`:

```html
<script src="/tier-entitlements-admin.js?v=2743" defer></script>
```

Then add a target container wherever you want the Tier Manager to render:

```html
<div data-loop-tier-entitlements></div>
```

If your admin already has route/tab switching, create a tab called something like:

```txt
Subscription & Tiers
```

and only place this container inside that tab.
