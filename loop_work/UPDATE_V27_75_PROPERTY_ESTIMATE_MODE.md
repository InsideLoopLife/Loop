# v27.75 Property estimate mode

This update makes property affordability work in beta without needing every official API connected on day one.

## New route

```txt
POST /api/property/estimate
```

## New pages

```txt
/household/property-estimate
/admin/property-sources
```

## SQL

```sql
db/v27_75_property_estimate_mode.sql
```

Verify:

```sql
select * from public.loop_v2775_property_estimate_healthcheck();
```

## Estimate flow

```txt
1. Validate postcode and infer local authority/region via Postcodes.io.
2. Pull nearby sold-price comparables from HM Land Registry where available.
3. Use user-entered price or nearby median sold price.
4. Convert current value into an estimated historic council-tax valuation-date value.
5. Estimate likely council tax band/range.
6. Estimate annual council tax cost using default or admin-entered local rates.
7. Store confidence, warnings, sources and evidence.
```

## API/account checklist now embedded

`/admin/property-sources` includes:

```txt
Postcodes.io
Ideal Postcodes
HM Land Registry Price Paid Data
GOV.UK EPC Open Data
Google Maps Platform
DfE/GOV.UK schools
Home insurance partner feeds
DVLA/MOT vehicle APIs
AI property research fallback
```

## User-facing rule

Always show:

```txt
Estimated likely council tax band
Estimated annual council tax
Confidence
Why
Verify exact address before purchase/rent decisions
```

Never show an estimated band as official.
