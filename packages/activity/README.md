# @asafarim/activity

Cross-app user-activity adapters for the superadmin User 360 explorer.

## Purpose

This package provides a unified interface for collecting and normalizing user activity data across different ASafariM Platform applications. It enables the superadmin User 360 explorer to display comprehensive user activity by standardizing activity events from various apps.

## Features

- **Activity Adapters**: Type-safe adapters for each app's activity data
- **Event Normalization**: Standardizes activity events across different apps
- **User-Activity Aggregation**: Combines activities from multiple apps for a single user
- **Activity Filtering**: Supports filtering by app, date range, and activity type

## Usage

```typescript
import { getActivityAdapter } from '@asafarim/activity';

// Get activities for a user across all apps
const adapter = getActivityAdapter('testora');
const activities = await adapter.getUserActivities(userId);

// Filter activities
const recentActivities = activities.filter(
  activity => activity.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000
);
```

## Supported Apps

- Hub
- Vionto
- EduMatch
- Testora
- TimelineAI
- ResuMatch
- TasksAI

## Architecture

Each app implements its own activity adapter that follows a common interface:

```typescript
interface ActivityAdapter {
  getUserActivities(userId: string): Promise<Activity[]>;
  getActivityTypes(): ActivityType[];
}
```

## Dependencies

- TypeScript
- No framework dependencies
- No database dependencies (apps handle their own data access)

## License

Portfolio Evaluation & Source-Available License - see LICENSE
