import type { TourChapter } from '../types';
import dashboard from './dashboard';
import budget from './budget';
import expenses from './expenses';
import investmatch from './investmatch';
import parksmart from './parksmart';
import peercompare from './peercompare';
import goals from './goals';
import reference from './reference';
import settings from './settings';
import ai from './ai';
import toolkit from './toolkit';
import lifemap from './lifemap';
import networth from './networth';
import calendar from './calendar';
import reports from './reports';

/**
 * Every chapter, in tour order. To add one: create `./<id>.tsx` exporting a
 * `TourChapter` as default, then add ONE line below. See ../AUTHORING.md.
 *
 * The order is the full tour's order: the front door first, then the money
 * tools in the order a new person would usually reach for them.
 */
export const CHAPTERS: readonly TourChapter[] = [
  dashboard,
  budget,
  expenses,
  investmatch,
  parksmart,
  peercompare,
  goals,
  lifemap,
  networth,
  calendar,
  reports,
  reference,
  ai,
  toolkit,
  settings,
];

export function chapterById(id: string, list: readonly TourChapter[] = CHAPTERS): TourChapter | undefined {
  return list.find((c) => c.id === id);
}

/** The chapter that tours the page at `pathname` (trailing slashes ignored). */
export function chapterForPath(pathname: string, list: readonly TourChapter[] = CHAPTERS): TourChapter | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  const normal = path === '/tools' ? '/tools/dashboard' : path;
  return list.find((c) => !c.floating && c.route === normal);
}
