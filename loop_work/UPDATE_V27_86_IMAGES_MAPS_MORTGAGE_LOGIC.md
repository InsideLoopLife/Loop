# v27.86 — image, map and mortgage logic check

This update fixes the logic seen in the screenshots after v27.85.2.

## Fixed

- Profile images now upload through `/api/account/avatar` using Ajax.
- Profile image preview updates immediately without waiting for a page refresh.
- The existing avatar URL is stored in the form so later profile saves do not lose the image.
- Remote images now render via `/api/image-proxy` so CSP/hotlinking does not block profile/home images.
- CSP now allows HTTPS images and OpenStreetMap embeds.
- Google Maps iframe has been replaced with OpenStreetMap embed where coordinates exist, removing the `ERR_BLOCKED_BY_CSP` panel.
- Household linked people are displayed using their claimed account profile name where available, so `gamingnectar` email-prefix labels are replaced by names like Bethany Charlton.
- `savePersonalIdentityProfile` now syncs linked household people rows with the claimed account name/avatar.
- House/home image URL is proxied before display.
- Mortgage card now shows an estimated follow-on/SVR payment box beside each attached mortgage.

## SQL

Run:

```sql
db/v27_86_images_maps_mortgage_logic_fix.sql
```

This creates/repairs avatar image storage buckets/policies and backfills linked household person names/images from claimed profiles.

## Notes

The SVR/follow-on card is a planning estimate. It is intentionally labelled as an estimate until a live lender-rate API or verified admin source is connected.
