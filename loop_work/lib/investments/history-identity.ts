export type SnapshotIdentity = {
  holding_id: string;
  listing_id?: string | null;
  instrument_id?: string | null;
};

export type CurrentHoldingIdentity = {
  id: string;
  listing_id?: string | null;
  instrument_id?: string | null;
};

/**
 * Prevents price history belonging to an old listing or ISIN mapping from
 * being joined onto a holding after its identity has been corrected.
 */
export function snapshotMatchesCurrentIdentity(
  row: SnapshotIdentity,
  holdingsById: Map<string, CurrentHoldingIdentity>,
) {
  const holding = holdingsById.get(row.holding_id);
  if (!holding) return false;
  if (holding.listing_id) return row.listing_id === holding.listing_id;
  if (holding.instrument_id)
    return !row.listing_id && row.instrument_id === holding.instrument_id;
  return !row.listing_id && !row.instrument_id;
}
