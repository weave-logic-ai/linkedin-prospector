// Test-only helper surface. Kept in the parser module so Jest's `@/` module
// mapper resolves it; cheerio itself lives in `app/node_modules` which the
// test-file dir (outside `app/`) does not see by default.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

export function loadHtmlForTests(html: string): CheerioAPI {
  return cheerio.load(html);
}
