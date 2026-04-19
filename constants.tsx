
import { UserRole, Service } from './types';

export const APP_NAME = "Hilot Center";

/** 
 * SESSION CONFIGURATION
 * Automated logout occurs after 30 days of total inactivity.
 */
export const SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; 

// Services are now managed purely via database; no initial mock defaults for new branches.
export const INITIAL_SERVICES: Service[] = [];

export const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
