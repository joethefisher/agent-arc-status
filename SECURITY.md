# Security Policy

## Supported versions

The Protocol is a pre-1.0 draft. Only the latest published version (currently **v0.2.x**) receives security fixes; older drafts are superseded.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, not as a public issue.

Use GitHub's private vulnerability reporting: open the repository's [**Security** tab → **Report a vulnerability**](https://github.com/joethefisher/agent-arc-status/security/advisories/new). This opens a private advisory visible only to you and the maintainer. Do not disclose details in a public issue or pull request before a fix is released.

The reference implementation parses untrusted JSON and treats event contents as data, never instructions (see [spec §9.4](spec/v0.2.md#9-security-considerations)). Reports about parser denial-of-service, validation bypass, or trust-boundary issues are in scope.

We aim to acknowledge a report within a few business days and to coordinate a fix and disclosure timeline from there.
