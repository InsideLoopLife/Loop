# V27 household UX and permissions patch

This patch makes Household a clearer user-owned feature:

- If the signed-in user has no active household, `/household` now shows a “Let’s build your household” empty state.
- Creating a household asks for name, timezone and currency, then makes the current user the household owner.
- Once created, the empty state disappears and the household page shows the active household.
- Managed child profiles can only be created for children under 16.
- Adults are invited by email/username and must accept before joining.
- Existing users receive an in-app notification and email invite.
- New users receive a branded account-create/join email and still must accept the household invite.
- QR/share invites land on the review/accept page and do not auto-join.
- Household owners/admins can change role/tier or remove members.
- Non-owner users can leave a household, which removes active membership and clears their active household link.
- Roles and permission tiers include explanatory UI.
- The family tree is laid out with adults above children and person cards using picture-left/name-right structure.

Run:

```sql
db/v27_household_creation_membership_permissions.sql
```

Then restart:

```bash
CTRL + C
npm install
npm run dev
```

