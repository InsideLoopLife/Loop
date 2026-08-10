# Vanguard LifeStrategy 80% quote and presentation fix

Apply this archive from the `loop_work` directory of the main Loop repository.

```bash
unzip -o loop-resilient-fund-mapping-fix.zip -d .
npm run typecheck
npm test
npm run build
git status --short
```

The changes:

- map ISIN `GB00B4PQW151` to Yahoo symbol `0P0000TKZM.L` (LifeStrategy 80%), not `0P0000TKZO.L` (LifeStrategy 100%);
- retain `80% Equity` in the compact holding label;
- label chart weights as a percentage of the selected view;
- prevent the cost-basis editor from creating a synthetic second purchase when genuine purchase lots exist;
- ignore an old synthetic cost-basis row wherever a genuine purchase thread exists.
- reject known-fund quotes when the returned symbol/name conflicts with the expected product;
- add an in-place **Find correct price source** search to existing holdings, preserving units and purchase threads.

After deployment, run **Check price** for the affected holding (or wait for the fund worker). Confirm the source contains `0P0000TKZM.L` and the price is in the expected LifeStrategy 80% range before cleaning old snapshots.

Alternatively, edit the holding and use **Find correct price source**. Selecting and saving a result performs a fresh server-side quote check, clears the old catalogue link, and retains the existing units and purchase threads.
