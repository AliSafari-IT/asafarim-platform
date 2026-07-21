# Security Policy

## Supported Versions

We support the latest release on the `main` branch and the current stable release tag. Security fixes are backported to the most recent release only when practical.

| Version | Supported          |
| ------- | ------------------ |
| latest `main` | :white_check_mark: |
| previous release | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability in **e2e-testora**, please report it privately so we can address it before it is publicly disclosed.

**Preferred channels:**

1. **GitHub Private Vulnerability Reporting** — open a private vulnerability report in this repository. This is the fastest way to triage and track a fix.
2. **Email** — if private reporting is unavailable, send details to `asafarim@gmail.com` with the subject line `[Security] e2e-testora vulnerability`.

Please do **not** open a public issue, discussion, or pull request for a security vulnerability until we have coordinated a disclosure.

## What to Include

To help us triage and fix the issue quickly, include as much of the following as possible:

- A clear description of the vulnerability and its impact.
- Steps to reproduce, including code snippets, requests, or screenshots if applicable.
- The affected component, route, or dependency.
- The version/branch you tested against.
- Whether you believe the vulnerability is actively exploitable.
- Any suggested mitigation or fix.

## Response Process

1. **Acknowledgment** — We will acknowledge receipt of your report within 5 business days.
2. **Triage** — We will assess the report, determine severity, and confirm whether it is a valid security issue.
3. **Fix** — We will develop a fix and, where appropriate, issue a security patch release.
4. **Disclosure** — We will coordinate public disclosure with you. We typically publish a security advisory and release notes, and we credit reporters who wish to be named.

## Scope

The following are generally in scope for security reports:

- Authentication and authorization bypasses in the web application or API.
- Injection flaws (SQL, command, SSRF, etc.).
- Unsafe handling of user credentials, tokens, or secrets.
- Code execution or path traversal in test execution, file upload, or seeding paths.
- Vulnerabilities in runtime dependencies that affect this project.

The following are **out of scope**:

- Vulnerabilities in the apps under test (e.g. the Vionto, Portal, or EduMatch apps) unless they are directly introduced or amplified by this testing platform.
- Reports against unsupported or end-of-life versions.
- Social engineering or physical security issues.

## Safe Harbor

We consider security research activities conducted in good faith and in accordance with this policy to be authorized. If you follow the reporting process above, we will not pursue legal action or revoke access for your research.

## Credits

We thank security researchers who report vulnerabilities responsibly. If you choose to be credited, we will list you in the release notes or security advisory for the fix.
