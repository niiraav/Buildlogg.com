import type { ReactNode } from 'react';

export type RouteKey = 'home' | 'jobs' | 'activity' | 'settings';
export type UserState = 'new' | 'returning';

export interface ContextExtra {
  type: 'stats' | 'tip' | 'shortcut' | 'status';
  content: ReactNode;
}

export interface ContextVariant {
  headline: string;
  body: string;
  extra?: ContextExtra;
}

export interface RouteContext {
  new: ContextVariant;
  returning: ContextVariant;
}

export const CONTEXT_CONTENT: Record<RouteKey, RouteContext> = {
  home: {
    new: {
      headline: 'Your workday, in one place',
      body: 'Track today\'s jobs, send quotes, and record payments as you move between sites.',
    },
    returning: {
      headline: 'Today\'s snapshot',
      body: 'Active jobs and anything that needs a nudge show up here.',
      extra: {
        type: 'stats',
        content: null,
      },
    },
  },
  jobs: {
    new: {
      headline: 'A job is a customer journey',
      body: 'Move jobs through each stage so you always know what\'s quoted, booked, or waiting to be paid.',
      extra: {
        type: 'tip',
        content: 'One job holds the quote, schedule, visit notes, and invoice.',
      },
    },
    returning: {
      headline: 'Pipeline view',
      body: 'Use the tabs to zoom in on active or unpaid work.',
      extra: {
        type: 'tip',
        content: 'Tap a status group to expand or collapse it.',
      },
    },
  },
  activity: {
    new: {
      headline: 'Everything you did, recorded',
      body: 'Activity automatically logs quotes sent, payments, and status changes so you can look back later.',
      extra: {
        type: 'tip',
        content: 'Everything is timestamped and tied to a job.',
      },
    },
    returning: {
      headline: 'Recent highlights',
      body: 'Patterns from the last week appear here.',
      extra: {
        type: 'stats',
        content: null,
      },
    },
  },
  settings: {
    new: {
      headline: 'Set up once, save time every quote',
      body: 'Add your business name, trade, and default payment terms so quotes look professional.',
      extra: {
        type: 'shortcut',
        content: 'Start with business name →',
      },
    },
    returning: {
      headline: 'Your defaults',
      body: 'These details appear on every quote you send.',
      extra: {
        type: 'status',
        content: null,
      },
    },
  },
};
