import { createLowlight } from 'lowlight';

import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';

/**
 * A deliberately small language set.
 *
 * `lowlight.all` registers every highlight.js grammar and adds roughly 900 kB to a
 * bundle that already warns at 2.2 MB. These eight cover what actually gets pasted into
 * an engineering wiki; adding one is a one-line import.
 *
 * `xml` also handles HTML, and `javascript` covers JSX.
 */
export const lowlight = createLowlight();

lowlight.register({ bash, css, html: xml, javascript, json, python, sql, typescript });

/** Offered in the code block's language dropdown. */
export const CODE_LANGUAGES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
];
