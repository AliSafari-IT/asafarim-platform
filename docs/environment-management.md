# Environment Management

The platform uses [`@asafarim/envage`](https://www.npmjs.com/package/@asafarim/envage)
0.3.3 for age-encrypted environment files. Envage protects secrets at rest in
Git; Next.js, Docker Compose, and `dotenv-cli` remain responsible for loading
decrypted values at runtime.

## Repository model

All current apps intentionally consume one root environment:

- `apps/web`
- `apps/hub`
- `apps/showcase`
- `apps/admin`
- `packages/db`
- root Docker Compose commands

`envage.config.json` therefore manages the repository root (`.`), not duplicate
copies in each app. App-level encrypted files should be introduced only when an
app needs a distinct secret boundary. Envage 0.3.3 applies every configured
environment name to every configured folder, so adding app folders prematurely
would create missing slots or duplicated secrets.

| Purpose | Plaintext (ignored) | Encrypted (committed) |
| --- | --- | --- |
| Local development | `.env` | `.env.age` |
| Production | `.env.production` | `.env.production.age` |

The public key `.age/key.pub` is committed. The private key `.age/key.txt` is
never committed.

## Initial setup and key custody

The repository already has a keypair. A maintainer must store `.age/key.txt` in
an approved password manager or secrets vault before relying on the encrypted
files as the only recoverable copy.

For a deliberate future key rotation only:

```bash
pnpm env:key:init
```

Do not regenerate the key casually: old encrypted files require the old private
key until they have been decrypted and re-encrypted with the replacement.

## Local workflow

On a machine that already has the private key:

```bash
pnpm env:decrypt:local
pnpm env:status
pnpm env:check
pnpm dev
```

After changing `.env`:

```bash
pnpm env:encrypt:local
git add .env.age
```

Review the encrypted-file change and commit it with the related configuration
change. Never stage the plaintext file.

Envage reports `both exist` while an active workstation has both `.env` and
`.env.age`; that is expected because the applications require the decrypted
file at runtime. `pnpm env:check` is the enforceable guard: it requires the
local ciphertext and public key, and fails if plaintext or the private key is
tracked or staged. It warns until a real production ciphertext is available.

## Production workflow

Create `.env.production` from `.env.production.example`, populate real values,
and encrypt it:

```bash
pnpm env:encrypt:production
git add .env.production.age
```

Production decryption is intentionally confirmation-gated by Envage:

```bash
pnpm env:decrypt:production
```

The VPS keeps its private key at `.age/key.txt`. `infra/scripts/deploy-prod.sh`
pulls the encrypted production file, decrypts it, and starts Compose with
`--env-file .env.production`. Plaintext environments and private keys are
excluded from Docker build contexts.

## Key rotation

1. Decrypt every managed file with the current key.
2. Back up the current private key in the secrets vault.
3. Generate a new keypair.
4. Re-encrypt every managed plaintext file.
5. Commit the new `.age/key.pub` and encrypted files together.
6. Provision the new private key to developers and deployment hosts.
7. Retire the old key only after every environment has been verified.

## CI policy

CI may build using environment values supplied by the CI secret store. It
should not receive `.age/key.txt` unless a job explicitly needs to decrypt a
managed file. Never print decrypted files or pass secrets as command-line
arguments. Public `NEXT_PUBLIC_*` build values may be supplied as Docker build
arguments; server-side secrets must be injected only at runtime.
