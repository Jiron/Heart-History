# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately
through GitHub's **Report a vulnerability** button on this repository's
*Security* tab. Include what you found, how to reproduce it, and what an
attacker could do with it.

## What is in scope

- **The assisted-reading server** (`server/ocr_server.py`). It is designed to be
  reachable from the internet through a tunnel and accepts uploads from anyone
  who can reach it. Its threat model, and what it deliberately does *not*
  protect against, is written down in
  [server/README.md](server/README.md#handling-files-from-strangers).
  `python server/attack_test.py` exercises the defences against a live server.
- **The app's network guarantee.** The `preview`, `production` and
  `production-apk` builds are meant to have no network access at all. Anything
  that lets one of them reach the network is a security bug.
- **Backup import.** Restoring a crafted backup file should never do anything
  except fail cleanly.

## What is not

- Problems that need the server's bearer token. Holding the token is the
  authorisation boundary, so treat it like a password.
- Anything that needs physical access to an unlocked phone.
