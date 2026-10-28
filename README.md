# CrimboGiveaway (v0.1 prototype)

**A KoLmafia relay-dropdown review desk for RyU giN's daily Crimbo proxy-ticket giveaway.**

This first version **does not send Kmail**. It is safe to review real purchases, inspect player profiles, exclude or approve players, and export a daily review CSV. The live prize-sending executor, receipt reconciliation, and final batch-send authorization are explicitly deferred until tested against KoLmafia and the in-game mail response. There is no hidden auto-sender.

## Install from KoLmafia gCLI

```text
git checkout https://github.com/donCannoli-burns/CrimboGiveaway.git
```

Open **Relay Browser** and choose **CrimboGiveaway** in the **-run script-** dropdown (the top-right/bottom-right location depends on your KoL UI layout). The UI script is `relay/relay_CrimboGiveaway.js` and its direct URL with the default relay proxy port is:

```text
http://127.0.0.1:60080/relay_CrimboGiveaway.js?relay=true
```

The gCLI entry point deliberately points users to the relay interface rather than doing background work:

```text
CrimboGiveaway
CrimboGiveaway help
```

If an older KoLmafia build does not display JavaScript relay scripts in the dropdown, update KoLmafia before attempting to use this tool. Do not replace an existing relay script to work around a missing menu item.

## Relay page navigation compatibility

KoLmafia routes `.js` files as JavaScript by default. A JavaScript **relay page** must use `?relay=true` to be served as rendered HTML; all CrimboGiveaway internal tabs and POST form actions preserve that marker. Without it, clicking links or action buttons may display raw page markup/source rather than the dashboard. If upgrading from v0.1, run `git update CrimboGiveaway`, then reload the relay page via the dropdown or use the URL above. Do not rely on previously open stale tabs.

## Workflow

1. In **Settings**, enter the **numeric KoL item ID** of the proxy ticket and the **numeric KoL item ID** of the actual prize. Both are required and must differ. The script looks up their canonical names using `Item.get(id)` and confirms `toInt(item) === id`; no fuzzy name-based configuration is accepted.
2. Select one campaign day between **2026-12-01 and 2026-12-31**.
3. Choose **Refresh KoL Store Log**. This makes one explicit read of `backoffice.php?which=3` and extracts purchases, with repeated captures deduplicated and identical distinct transactions preserved.
4. Choose **Inspect next 5 profiles**, or inspect individuals. Profile parsing reads `showplayer.php?who=<ID>` as HTML (no JavaScript is executed and profile snowball effects cannot run in that parser).
5. Examine review flags. Explicitly approve, hold, or exclude individual players. Approvals never trigger sending.
6. Export a per-day CSV review list and preserve the KoLmafia `data/` state file for audit.

**The new-account rule:** accounts created **on or after 2026-12-01** are automatically added to exclusions when inspected. This is a hard rule in the prototype, so an unexclude action alone cannot make them eligible. Missing/unparseable profiles are held, not trusted as old accounts. Names containing `bot` are flagged only. Ascensions <= 1, total turns < 10,000, absence of clan, store, or display case are review-only signals. None proves an account is a bot or a multi.

## Data, compatibility, and limits

- Only known KoLmafia scripting functions are used; no external service or build step is required.
- Durable state is saved per logged-in account to `data/crimbo-giveaway-<owner-id>.json` via `bufferToFile`.
- Each event records its day, timestamp, action, and the affected player ID. All writes fail closed if the state file is malformed.
- Profile URLs are numeric, not arbitrary user-supplied addresses. The ID is authoritative; unresolved buyer names must be manually linked to player IDs before they can be approved.
- Reads of the Store Log are manual: there is no timer, auto-claim, polling, or automation of player interactions.
- Store Log only shows a rolling window. Save a daily capture; missed history cannot be recovered if it was never observed.
- This repo is **separate from Mall Manager** to avoid overwriting `relay/backoffice.ash` or changing store repricing. It reuses the *approach* and transaction format, not a hard dependency on Mall Manager.
- If you want snowball prevention on *ordinary* KoL profile pages, refer to [the existing KoLmafia forum hook](https://kolmafia.us/threads/hide-snowballs-in-player-profiles.29556/). We intentionally do not install `relay/showplayer.ash`, because it could overwrite another user's relay override. Background profile inspection does not execute the page JavaScript.
- **Migrating from v0.1 name-based settings:** older `proxy`/`prize` labels in the saved JSON are preserved until Settings is saved again, but intentionally ignored. Enter both numeric IDs, inspect their resolved names, and save. No old name is automatically converted into an ID.
- If the item ID does not resolve in the local KoLmafia item database, the dashboard reports an unknown ID and does not build an approval queue. Both IDs must resolve and be distinct. No remote item lookup is performed.
- The Store Log exposes item *names* rather than authoritative item IDs; matching is against the KoLmafia-resolved canonical proxy name. A rare exact-name collision in the Store Log cannot be distinguished by this evidence alone. Verify the proxy item in the shop.
- CSV exports include `prize_item_id` and the resolved `prize_item_name`, not a user-entered prize label.
- A **daily CSV export is not proof that items were sent**. Live Kmail and reconciliation belong in a later separately verified release.
- The UI theme uses only black (`#000000`), Frost Blue (`#ABD1F3`), Light Tropical Blue (`#C2E0F9`), True White (`#FCFCFF`) and Clear Frost (`#DFF7FA`) without gradients or shadows.

## Developer smoke tests (Node is for tests only)

```sh
node tests/core.test.js
node tests/relay.test.js
node -c scripts/CrimboGiveaway.js
node -c scripts/crimbo-core.js
node -c relay/relay_CrimboGiveaway.js
```

Tests use mocked `kolmafia` APIs. They are **not a substitute for a live KoLmafia relay-browser smoke test**. The first smoke test should verify the relay dropdown and a read-only Store Log refresh; no live prize sending is possible in v0.1.

## Next milestone

Implement a recipient-ID-only, approval-gated sending adapter; frozen batch digest; stock/recipient validation; one-item-at-a-time checkpointing; `UNKNOWN` outcomes after transport failure; no blind retries; and sent-Kmail reconciliation. Test with a cheap transferable item and an explicitly authorized single recipient before enabling valuable prizes. Keep the manual send button disabled until those conditions are met.
