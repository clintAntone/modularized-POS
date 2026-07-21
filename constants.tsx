
import { UserRole, Service } from './types';

export const APP_NAME = "Hilot Center";

/**
 * SESSION CONFIGURATION
 * Branch Manager / Portal User: 8 hours of inactivity → auto logout
 * SuperAdmin: 7 days (manages the whole network, needs more persistence)
 */
export const SESSION_TIMEOUT_MS             = 8 * 60 * 60 * 1000;        // 8 hours  (default / branch)
export const SESSION_TIMEOUT_SUPERADMIN_MS  = 7 * 24 * 60 * 60 * 1000;  // 7 days   (superadmin)

// Services are now managed purely via database; no initial mock defaults for new branches.
export const INITIAL_SERVICES: Service[] = [];

export const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
