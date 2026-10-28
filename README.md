# CrimboGiveaway (v0.2 guarded Kmail prototype)

**A KoLmafia relay-dropdown review desk for RyU giN's daily Crimbo proxy-ticket giveaway.**

The v0.2 workbench adds a **human-triggered Kmail executor** using KoLmafia's native `send` gCLI command. No automatic/background sending is implemented. **Live sending has only been tested with mocks; real KoLmafia mail delivery is NOT yet verified.** Test a single approved recipient with a cheap transferable prize before using big-ticket items. KoLmafia's `send` may fall back to a gift package if normal Kmail cannot be delivered, so check packaging/transfer rules for your items.

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
5. Examine review flags. Explicitly approve, hold, or exclude individual players. Approvals **never** trigger sending.
6. On the **current KoL rollover date** only, use **Freeze approved batch**. The UI lists exact player IDs, item ID/name, and counts. Verify all recipients before sending.
7. Type the precise confirmation phrase `SEND <batch-id>` and click **Send next 5 approved prizes**. Each click sends a maximum of five one-item messages, recording `STARTED` **before** every outbound attempt. Repeat only after reviewing the updated statuses; no background sending.
8. KoLmafia `cliExecute("send 1 ¶<prize-ID> to <player-ID> || Happy Crimbo! ...")` executes one numeric-item and numeric-recipient transfer at a time. The item and recipient numbers are never supplied as arbitrary raw commands.
9. A `SENT_OBSERVED` record means the KoLmafia command returned true **and** the on-hand prize count dropped by exactly one; this is not independent proof of recipient delivery. A timeout, exception or unexpected inventory result is `UNKNOWN` and stops the batch with no blind retry. Verify KoL's sent messages manually; only then may you record `RECONCILED_SENT` for an uncertain recipient.
10. Export the per-day CSV and preserve the `data/crimbo-giveaway-<owner-id>.json` file for an audit trail.

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
- A **daily CSV export is not proof that items were sent**. Use the append-style event history and immutable daily delivery ledger. Both track attempts and observed results; human sent-folder verification is required for ambiguous outcomes.
- Sending requires validated item IDs, the current KoL rollover date, the matching logged-in sender, enough on-hand items, eligible/approved player IDs, a frozen batch, and a typed second-step confirmation. Only **five** recipients are attempted per click. There is no scheduling or automatic sending.
- The delivery ledger is keyed by `giveaway_day + player_id` and blocks duplicate sends even if prize ID changes later. Existing `STARTED`/`UNKNOWN` attempts are never retried automatically. Excluded/held players are skipped; a skipped row also occupies the daily key.
- KoLmafia's native `send` command may choose a gift fallback when ordinary Kmail cannot deliver. This prototype does not override that behavior. Test with inexpensive items and verify KoL's rules and package costs before using valuable items.
- **Operational limitation:** simultaneous browser submissions or multiple active instances of KoLmafia are not supported; use one instance and one operator. Local persistence is checkpointed, not transactional across a KoL network transfer.
- The UI theme uses only black (`#000000`), Frost Blue (`#ABD1F3`), Light Tropical Blue (`#C2E0F9`), True White (`#FCFCFF`) and Clear Frost (`#DFF7FA`) without gradients or shadows.

## Developer smoke tests (Node is for tests only)

```sh
node tests/core.test.js
node tests/relay.test.js
node tests/mail.test.js
node tests/relay-mail.test.js
node -c scripts/CrimboGiveaway.js
node -c scripts/crimbo-core.js
node -c relay/relay_CrimboGiveaway.js
node -c scripts/crimbo-mail.js
```

Tests use mocked `kolmafia` APIs. They are **not a substitute for a live KoLmafia relay-browser smoke test**. The first smoke test should verify the relay dropdown and a read-only Store Log refresh; v0.2 does include live sends, but the first authorized in-game trial MUST use a cheap item and a single recipient.

## Next milestone

Perform an explicitly authorized cheap-item single-recipient live smoke test. Confirm that numeric player ID delivery works on the installed KoLmafia version and inspect any gift fallback, sent-mail evidence, and local inventory changes. Before recommending large distributions, harden concurrency control and add authoritative sent-mail reconciliation instead of relying only on the CLI return value and inventory delta.
