/** The demo names old test data carries. Matched exactly, so a real "Alexander" or "alex_k" is never renamed at sign-in. */
export function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "learner" || n === "alex rivera";
}

export function isPlaceholderHandle(handle: string): boolean {
  return /^alex_?rivera\d*$/i.test(handle.trim());
}
