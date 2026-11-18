# Security policy

Datardo holds the credentials of MongoDB and Redis deployments, opens SSH tunnels and serves an MCP server on the
local machine, so a weakness in it can expose data. Reports are welcome.

## Supported versions

| Version | Gets security fixes |
| --- | --- |
| The latest release | Yes |
| Older releases | No: update to the latest |

Datardo says when a newer version exists; it does not update itself.

## Reporting a vulnerability

**Do not open a public issue.** Report it in private through GitHub: on the page of Datardo's repository,
[github.com/riccardoflp/datardo](https://github.com/riccardoflp/datardo), open **Security** and choose **Report a vulnerability**. Only the maintainer sees the report.

Say what you found, how to reproduce it, which version of Datardo, on which system, and for which engine (MongoDB,
Redis or both).

## What happens next

You get an answer saying whether the report is accepted. A fix is released as a new version, with the vulnerability
described in the CHANGELOG once the release is out, and the reporter credited unless they ask not to be.

## Checking a download

The installers are not signed. The page of each release gives the SHA-256 of every installer: compare it with the
file you downloaded before running it.

What Datardo defends against, and what it does not, is in [docs/security.md](docs/security.md).
