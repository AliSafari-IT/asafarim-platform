# @asafarim/settings-client

Read-only HTTP client for Admin's internal platform-settings API — used by isolated-DB apps (Testora, AppBuilder, ResuMatch, TasksAI).

## Purpose

This package provides a type-safe HTTP client for reading platform settings from the Admin Console's internal API. It is designed for apps with isolated databases that need to access platform configuration without directly connecting to the shared platform database.

## Features

- **Type-Safe Client**: Fully typed settings schema
- **Internal API Authentication**: Uses `INTERNAL_API_SECRET` bearer token
- **Caching**: Built-in caching for performance
- **Error Handling**: Standardized error responses
- **No Framework Dependencies**: Can be used in any Node.js environment

## Usage

```typescript
import { SettingsClient } from '@asafarim/settings-client';

const client = new SettingsClient({
  apiUrl: 'https://admin.asafarim.com/api/internal/settings',
  internalApiSecret: process.env.INTERNAL_API_SECRET,
});

// Get all platform settings
const settings = await client.getSettings();

// Get specific setting
const aiProvider = await client.getSetting('aiProvider');
```

## Environment Variables

- `INTERNAL_API_SECRET`: Shared secret for internal API authentication
- `ADMIN_API_URL`: URL of the Admin Console's internal API (optional, defaults to production)

## API Endpoints

- `GET /api/internal/settings` - Get all platform settings
- `GET /api/internal/settings/:key` - Get a specific setting

## Settings Schema

The client follows the settings schema defined in the Admin Console:

```typescript
interface PlatformSettings {
  aiProvider: {
    provider: 'openai' | 'anthropic' | 'google';
    apiKey: string;
    model: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  // ... additional settings
}
```

## Security

- All requests are authenticated using the `INTERNAL_API_SECRET` bearer token
- The client is read-only - no modification of settings is allowed
- Secrets are encrypted at rest in the Admin Console database
- Only specific apps (Testora, AppBuilder, ResuMatch, TasksAI) are allowlisted

## Dependencies

- TypeScript
- Node.js fetch API (or node-fetch for older Node versions)
- No Next.js dependencies
- No database dependencies
- No auth session dependencies

## License

Portfolio Evaluation & Source-Available License - see LICENSE
