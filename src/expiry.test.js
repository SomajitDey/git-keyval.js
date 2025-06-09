import * as x from './expiry.js';
import date from 'date-and-time';
import { setTimeout } from 'node:timers/promises';
import assert from 'assert';

describe('Testing src/expiry.js', () => {
  it('dateToId() and daysBetween()', () => {
    const now = new Date();
    const future = x.dateToId(date.addDays(now, x.lifetimeDays - 1));
    const past = x.dateToId(date.addDays(now, 3));
    assert.equal(x.daysBetween(past, future), x.lifetimeDays - 1 - 3);
  });

  it('Reproducibility of idToDate() and getToday()', async () => {
    const day = date.addDays(x.getToday(), 5);
    const id = x.dateToId(day);
    const datePre = x.idToDate(id);
    await setTimeout(1000); // Wait for minimum 1 second
    const datePost = x.idToDate(id);
    assert.deepStrictEqual(datePre, datePost);
    assert.deepStrictEqual(datePre, day);
  });

  it('idToDate(yesterdayId()) returns yesterday', () => {
    const yesterday = x.idToDate(x.yesterdayId());
    assert.equal(date.subtract(x.getToday(), yesterday).toDays(), 1);
  });

  it('yesterdayId()', () => {
    assert.equal(x.daysBetween(x.yesterdayId(), x.dateToId()), 1);
  });

  it('getExpiry() and getTtl()', () => {
    const expiry = x.getExpiry(25);
    assert.equal(Math.floor(x.getTtlDays(expiry)), 25);
    const fraction = x.getTtlDays(x.getToday());
    assert.ok(fraction > 0 && fraction < 1);
  });
});
