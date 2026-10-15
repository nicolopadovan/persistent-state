# Security policy

## Reporting a vulnerability

Report vulnerabilities privately, through
[GitHub's private vulnerability reporting](https://github.com/nicolopadovan/persistent-state/security/advisories/new),
not in a public issue. Include the affected version, the steps to reproduce and the impact you expect.

Examples of what to report:

- Storage written or read while the consent predicate returns false.
- Cookie injection through keys, values or attribute options.
- A cookie leaked to the client that `PersistentStateProvider` was not given.

## Supported versions

Security fixes are released for the latest minor version of the current major version. While the package is 0.x,
that is the latest minor.

## Secrets

Never put live tokens or session cookies in an issue, pull request or screenshot. If one leaks, rotate it first.
