# Bind a submission id to the browser that created it

## Description

Submission ids are random UUIDs, but nothing binds an id to the browser that created it: someone
who learns an id could open upload sessions and commit into that submission's prefix. Issue a
signed submission token at the first upload, and require it on every later upload start and on the
commit for the same id.
