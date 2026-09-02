"use client";

// THE SWITCH.
//
// One component, two painters, one prop list. The instrument mounts this and
// never knows which painter it got — which is the property that makes the
// comparison honest, because any behavioural difference between the two
// tabs is a difference in PAINTING rather than in what the product decided.
//
// ── WHY A QUERY PARAMETER ──────────────────────────────────────────────
//
// `?renderer=canvas` / `?renderer=svg`, resolved on the client. The whole
// value of the slice is putting two tabs side by side on the same graph, at
// the same camera, and flipping between them without a rebuild — which a
// build flag cannot do and a stored preference makes stickier than an
// experiment should be. It also means rollback is a URL, not a deploy.
//
// SVG REMAINS THE DEFAULT AND REMAINS INTACT. Nothing here deletes it,
// deprecates it, or routes around it: an A/B whose control has been touched
// is not an A/B.

import { useEffect, useState } from "react";
import SignalGraph from "../SignalGraph";
import CanvasAuditRenderer from "../CanvasAuditRenderer";
import { DEFAULT_RENDERER, resolveRenderer, type AuditRendererProps, type RendererId } from "./types";

export interface AuditGraphRendererProps extends AuditRendererProps {
  /** Force a painter. Omitted in the product; used by the comparison harness
      and by proofs that need to mount one deliberately. */
  renderer?: RendererId;
}

export default function AuditGraphRenderer({ renderer, ...props }: AuditGraphRendererProps) {
  // READ ON THE CLIENT, AFTER MOUNT, DELIBERATELY. The page is server
  // rendered; reading the query string during render would make the server
  // and the client disagree about which painter exists and cost a hydration
  // mismatch on every load. One extra commit on a dev-only switch is the
  // cheaper mistake.
  const [fromUrl, setFromUrl] = useState<RendererId>(DEFAULT_RENDERER);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFromUrl(resolveRenderer(window.location.search));
  }, []);

  const choice = renderer ?? fromUrl;
  if (choice === "canvas") return <CanvasAuditRenderer {...props} />;
  return <SignalGraph {...props} />;
}
