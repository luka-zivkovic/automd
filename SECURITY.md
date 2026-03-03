# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue**
2. Email **security@automd.io** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You'll receive an acknowledgment within 48 hours
4. We'll work with you to understand and fix the issue before any public disclosure

## Scope

The following are in scope:

- AutoMD server (`packages/server/`)
- MCP server (`packages/mcp/`)
- Authentication and API key handling
- Webhook secret management
- File system access and path traversal

The following are out of scope:

- The frontend React app (client-side only, no sensitive data)
- Denial of service attacks
- Issues in third-party dependencies (report upstream)

## Security Design

- API keys are hashed with SHA-256 before storage
- Webhook secrets use HMAC-SHA256 for payload signing
- File operations are sandboxed to the configured data directory
- CORS is configurable and restrictive by default
