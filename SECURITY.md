# Security Policy

## Supported versions

The Protocol is a pre-1.0 draft. Only the latest published version (currently **v0.2.x**) receives security fixes; older drafts are superseded.

## Reporting a vulnerability

> **TODO (before public launch):** add the private disclosure contact here — either a security email (e.g. `security@…`) or enable GitHub private vulnerability reporting for this repository and link it. Until then this section is a placeholder.

Please report suspected vulnerabilities **privately**, not as a public issue. Until the contact above is filled in, open a minimal private channel with the maintainer rather than disclosing details publicly.

The reference implementation parses untrusted JSON and treats event contents as data, never instructions (see [spec §9.4](spec/v0.2.md#9-security-considerations)). Reports about parser denial-of-service, validation bypass, or trust-boundary issues are in scope.

We aim to acknowledge a report within a few business days and to coordinate a fix and disclosure timeline from there.
