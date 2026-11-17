// Server actions that only read (look something up, read a bill) shouldn't show "Saved – it's live".
// Wrap the call: quietly(() => readSomething(args)). The tray skips the next action request.

let pending = 0;

export function quietly<T>(run: () => Promise<T>): Promise<T> {
  pending += 1;
  return run().finally(() => { pending = Math.max(0, pending - 1); });
}

/** Called by the submission tray for each server action request; true means "don't show it". */
export function consumeQuietAction(): boolean {
  return pending > 0;
}
