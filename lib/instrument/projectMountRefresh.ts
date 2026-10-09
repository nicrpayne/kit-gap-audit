/** Several instruments can share a page (Control Room embeds Timeline).
 * A nested reader mounting must not invalidate the parent's pending Scenario,
 * unmount itself, and repeat that cycle forever. Only entry into an otherwise
 * unmounted reader tree starts the navigation read. Focus/timer/owner changes
 * still perform their existing revalidation. */
export function createProjectMountRefresh() {
  const readers = new Set<object>();
  return (refresh: () => void) => {
    const first = readers.size === 0;
    const reader = {};
    readers.add(reader);
    if (first) refresh();
    return () => { readers.delete(reader); };
  };
}
export const retainProjectReader = createProjectMountRefresh();
