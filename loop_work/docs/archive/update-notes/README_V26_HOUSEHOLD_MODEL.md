# V26 household accounts and invite model

This patch tightens the model for normal users creating and sharing households.

Key changes:
- A normal verified user can create a household and becomes household owner.
- Users can belong to multiple households and choose the active household.
- Household invites are explicit requests: email + in-app notification where the invited email already has an account.
- Login/signup only surfaces pending invites; it does not silently accept them.
- Accepting a household invite adds membership and sets the accepted household as active.
- Existing person-profile claim links can be accepted by token or by invite id from notifications.
- Dashboard context now respects the active household stored on the user profile.

Run db/v26_household_accounts_and_invites.sql after installing.
