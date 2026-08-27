import type { WidgetSpec } from '@superset/sdk';
import { prFilesWidget } from './pr-files.js';
import { assignedPRsWidget } from './assigned-prs.js';

export const widgets: WidgetSpec[] = [prFilesWidget, assignedPRsWidget];
