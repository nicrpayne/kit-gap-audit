# InteractiveBriefBundleV1

The bundle is a self-contained handoff artifact:

```ts
interface InteractiveBriefBundleV1 {
  version: "interactive-brief-bundle.v1";
  presentationVersion: "brief-presentation.v1";
  snapshotFingerprint: string;
  briefSnapshot: DecisionBriefV1;
  recipe: BriefRecipeV1;
  presentation: BriefPresentationV1;
  permittedReferences: { label: string; href: string; owner: TruthOwner }[];
  audienceMetadata: {
    audience: AudienceLens;
    purpose: BriefPurpose;
    externalDisclosure: "internal" | "operator-review-required";
  };
  security: {
    liveOwnerAccess: false;
    databaseCredentials: false;
    secrets: false;
    publishAuthorized: false;
  };
}
```

The bundle contains only frozen Report facts and links already permitted by included modules. It carries no database credentials, live Signal access, secret, storage configuration, analytics, or publication authority.
