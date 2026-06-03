# SecretVault SDK

Client SDK for [SecretVault](https://github.com/itsaygea/secretvault-mcp) — encrypted secret management with credential proxying.

## Install

```bash
npm install git+https://github.com/itsaygea/secretvault-sdk.git
```

## Quick Start

```typescript
import { SecretVault } from '@itsaygea/secretvault-sdk';

const vault = new SecretVault({
  serverUrl: 'http://your-server:3004',
  linkingKey: 'sv_your_linking_key',
});

// List secrets (masked values only)
const secrets = await vault.listSecrets();

// Create a secret (encrypted server-side)
await vault.createSecret('api_key', 'sk_live_abc123', {
  environment: 'production',
  tags: ['stripe', 'payments'],
});

// Use secrets through the credential proxy — your app never sees real credentials
const res = await vault.proxyFetch('stripe', '/v1/charges');
const data = await res.json();
```

## Getting a Linking Key

1. Open your SecretVault Web UI (e.g. `http://your-server:3004/ui`)
2. Log in as admin
3. Create a user or go to your profile
4. Generate a linking key (starts with `sv_`)

Linking keys are per-user, can be rotated without changing secrets, and never expire.

## API

### Constructor

```typescript
new SecretVault({ serverUrl: string, linkingKey: string })
```

Throws if the linking key doesn't start with `sv_`.

### Secrets

| Method | Description |
|--------|-------------|
| `listSecrets()` | List all secrets with masked values |
| `searchSecrets({ keyword?, tags? })` | Search by name or tags |
| `getSecretReference(name)` | Get a reference token and usage example |
| `createSecret(name, value, options?)` | Create a new encrypted secret |
| `rotateSecret(name, newValue)` | Replace a secret's value |
| `deleteSecret(name)` | Delete a secret permanently |

### Proxy

| Method | Description |
|--------|-------------|
| `proxyFetch(service, path, init?)` | Fetch through the credential proxy |
| `proxyUrl(service, path?)` | Get the proxy URL for manual fetch calls |
| `proxyHeaders()` | Get auth headers for proxy access |

### Profiles

| Method | Description |
|--------|-------------|
| `listProfiles()` | List service profiles |
| `createProfile(profile)` | Create a service profile |
| `deleteProfile(profileId)` | Delete a service profile |

### User

| Method | Description |
|--------|-------------|
| `me()` | Get current user info |

## How It Works

```
Your App  ──linking key──>  SecretVault Server  ──decrypted creds──>  Upstream Service
```

1. Your app sends requests with a linking key (not real credentials)
2. The server looks up which secrets belong to your user
3. For proxy requests, the server decrypts secrets and injects them into the upstream call
4. Your app receives the upstream response — credentials never leave the server

## Security

- **Zero dependencies** — uses native `fetch`, no third-party packages
- **No raw values** — `listSecrets()` returns masked previews like `sk_****4f2a`
- **No master key needed** — all encryption happens server-side
- **User-scoped** — each linking key is tied to a specific user
- **Proxy isolation** — credentials are decrypted and injected server-side, never exposed to the client

## TypeScript

Full type definitions included. Works with any TypeScript project targeting ES2022+.

## Requirements

- A running [SecretVault server](https://github.com/itsaygea/secretvault-mcp)
- A linking key generated from the Web UI

## License

MIT
