// One material per source of truth, in its own module so the surface, the
// modules and the inspector all read the same vocabulary without importing
// a client component to get at a constant.
//
// State owns colour. This is not a palette to pick from -- it is a closed
// set, and the reason the score does not become a rainbow.
export const FAMILY_COLOR: Record<string, string> = {
  forecast: "var(--i-violet)",
  decision: "var(--i-amber)",
  finding: "var(--i-red)",
  context: "#7fb4e8",
  work: "var(--i-mint)",
  landmark: "var(--i-signal)",
};
