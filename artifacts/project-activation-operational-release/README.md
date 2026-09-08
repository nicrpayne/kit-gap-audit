# Project Activation operational release

This release closes the operator gap between Signal and the local Hermes/KE
corpus. `+ Project → Create & Scan` now creates a pre-Reality job that is
claimed by an outbound-only Mac LaunchAgent. The companion reconstructs
historical knowledge locally, validates a bounded
`BootstrapKnowledgePackageV1.1`, and posts proposals back to Signal. No local
path or credential crosses the boundary, and no proposal becomes canonical
before governed Review and Activate.

Starting production was `bce38dde332fa1d049363fe502c5921326556311`.
The operational code commit is `931e2dd6d7ecfec20d5be4431459b264ed492c2c`.
The final release marker is the docs-only forward commit containing the
production smoke record below.

The disposable real-corpus proof used bootstrap
`cmtsxcdmb0000itqkfez3dhoe`, job `cmtsxcjzc0004itqkgkz9nmmj`, and package
`hermes-bootstrap-63dab062b7e2daaaa5eb9b98d221485b`. The UI/API created the
scan request; the automatic daemon claimed and completed it without invoking
the manual `kit-gap bootstrap` command.

The governing rule remains: Hermes owns what was said. Signal owns what is true
about delivery. Everything that crosses is quotable. Nothing that crosses is
authoritative.

See the adjacent architecture, contract, security, gate, smoke, rollback, and
measurement records. Screenshots show the companion-backed Scan, evidence
Review, and first frozen ContextSnapshot/Audit.

Production promotion succeeded. The first promoted marker was `7537ffe…` in
Railway deployment `e11c6167-6c62-4c99-aa44-26ed1894c7a3`; the final marker is
the evidence-only descendant containing this update.
