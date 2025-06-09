// Brief: Utilities related to expiry

// Notes:
// Expiry dates are to be stored in the GitHub repo / database as integer indices (Id).
// Id counts the number of days since a time origin, modulo something called a lifetime.
// To keep repo size manageable with GitHub garbage-collection not being in our control,
// we must limit how big an Id can get. This limit is decided by a lifetime.
// TTL beyond lifetime should be equivalent to persistency / eternity.

import date from 'date-and-time';

export const timeOrigin = new Date('2025-01-01T00:00:00Z'); // Any time from recent past

// Lifetime must be so large that retaining data beyond it practically means persistency
export const lifetimeDays = 10002;

// max TTL must be < lifetime, because deletion will be done by GitHub workflow 1 day after expiry
// However, max TTL must be as big as possible. Hence -1 below.
export const maxTtlDays = lifetimeDays - 1;

export function getToday (now = new Date()) {
  return new Date(now.setUTCHours(23, 59, 59, 0));
}

export function dateToId (dateObj = new Date()) {
  const intervalDays = Math.floor(date.subtract(dateObj, timeOrigin).toDays());
  return intervalDays % lifetimeDays;
}

// Brief: Data that expired yesterday will be removed today. Returns the ID of yesterday.
export function yesterdayId (now = new Date()) {
  return dateToId(date.addDays(now, -1));
}

export function daysBetween (idBegin, idEnd) {
  return ((idEnd - idBegin) + lifetimeDays) % lifetimeDays;
}

export function idToDate (id) {
  if (isNaN(id) || id < 0 || id > lifetimeDays - 1) {
    throw new Error(`Index must be within [0, ${lifetimeDays - 1}]`);
  }

  const today = getToday();
  const idToday = dateToId(today);
  if (id === idToday) return today;

  // If id refers to yesterday, it is stale / defunct and will be deleted today.
  if (id === yesterdayId()) return date.addDays(today, -1); // Return yesterday's date.

  // Assuming all stale IDs have been deleted,
  // id < idToday can only mean id refers to a date in the next lifetime
  // id > idToday, however, must refer to a date in the current lifetime
  const remainingDays = daysBetween(idToday, id);

  return date.addDays(today, remainingDays);
}

export function getExpiry (ttlDays, now = new Date()) {
  // ttlDays = -1 is allowed to test/debug GC (garbage-collection) instantly
  if (isNaN(ttlDays) || ttlDays < -1 || ttlDays > maxTtlDays - 1) {
    throw new Error(`TTL must be within [-1, ${maxTtlDays - 1}]`);
  }
  return date.addDays(getToday(now), Math.floor(ttlDays));
}

// Returns: <number>, can have a fractional part
export function getTtlDays (expiry) {
  const now = new Date();
  if (expiry.getTime() < now.getTime()) return 0;
  return date.subtract(expiry, now).toDays();
}

// Brief: If id refers to yesterday, it is stale / defunct and will be deleted today.
export function isStale (id) {
  return id === yesterdayId();
}
