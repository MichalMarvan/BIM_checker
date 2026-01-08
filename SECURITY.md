# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Model

BIM Checker is a **client-side only** application. All file processing happens locally in your browser:

- No files are uploaded to any server
- No data leaves your device
- All processing uses Web Workers and IndexedDB for local storage
- No backend API or database connections

This architecture significantly reduces the attack surface compared to traditional web applications.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Send an email to the project maintainer via GitHub (open a private security advisory)
3. Or use GitHub's private vulnerability reporting feature at:
   https://github.com/MichalMarvan/BIM_checker/security/advisories/new

### What to Include

Please include the following in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if you have one)
- Your name/handle for credit (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depending on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium: Within 30 days
  - Low: Next scheduled release

### What to Expect

1. Acknowledgment of your report
2. Assessment and validation of the vulnerability
3. Development and testing of a fix
4. Coordinated disclosure (if applicable)
5. Credit in the release notes (unless you prefer anonymity)

## Security Best Practices for Contributors

When contributing to this project, please follow these guidelines:

### Code Security

- Never commit secrets, API keys, or credentials
- Sanitize all user inputs before processing
- Use Content Security Policy (CSP) headers
- Avoid `eval()` and similar dynamic code execution
- Validate file formats before parsing

### IFC/IDS File Handling

- Treat uploaded files as untrusted input
- Implement size limits for file uploads
- Use Web Workers for heavy processing to prevent main thread blocking
- Handle malformed files gracefully without exposing internal errors

### Dependencies

- Keep dependencies up to date
- Review dependency changes before merging
- Use `npm audit` to check for known vulnerabilities

## Known Security Considerations

### Browser Storage

- IndexedDB is used for local file storage
- Data is not encrypted (browser handles security)
- Clearing browser data will remove all stored files

### Third-Party Libraries

- xlsx: Used for Excel export functionality
- All vendor scripts are included locally (no CDN dependencies)

## Security Updates

Security updates will be announced through:

- GitHub Security Advisories
- Release notes in CHANGELOG.md
- Repository releases page
