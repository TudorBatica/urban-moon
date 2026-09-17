# Record the consent text with the submission

## Description

The summary's send panel blocks sending until the consent checkbox is ticked, but what the client
agreed to is not stored. Record, in `manifest.json`, the consent text shown and the moment it was
given, so each submission carries its own proof of consent. This is a manifest change (additive:
keep `schemaVersion`) in `packages/domain-data`, written by the web app at commit.
