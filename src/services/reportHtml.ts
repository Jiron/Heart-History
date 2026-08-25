/**
 * The doctor's report, as HTML.
 *
 * Kept apart from `report.ts` for the same reason `src/ocr/` is kept apart from
 * everything else: this file imports nothing from React Native or Expo, so the
 * exact markup that becomes the PDF can be generated in Node and looked at in a
 * browser. See tools/report-preview.ts. Turning it into a file and putting it in
 * front of the user lives next door.
 */

import { BOUNDED, classify, type ThresholdSet } from '@/domain/classification';
import {
  averagesByDayPart,
  bucketise,
  chooseBucket,
  sevenDayAverage,
  summarise,
  trendOf,
  type DateRange,
} from '@/domain/statistics';
import type { Profile, Reading } from '@/domain/types';
import type { Dictionary } from '@/i18n/de';
import { formatDate, formatTime } from '@/lib/format';

/** Escapes text before it goes into the report's HTML. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CATEGORY_COLOURS: Record<string, string> = {
  low: '#5B8DEF',
  optimal: '#12915F',
  normal: '#4F9B36',
  highNormal: '#B9741A',
  grade1: '#DB7016',
  grade2: '#D6303C',
  grade3: '#9B1B44',
};

/**
 * Builds a printable summary of a period, as a PDF the user can hand to a
 * clinician or keep as a record.
 *
 * Rendered as self-contained HTML with an inline SVG chart — no external assets,
 * no fonts to fetch, nothing that needs a network connection to lay out.
 */
/**
 * The context column: arm, posture, irregular-heartbeat flag, tags and note.
 *
 * Everything here is stored as a language-independent key — `left`, `sitting`,
 * `beforeMedication` — and translated at the point of display. The report used
 * to print the keys directly, so a German report carried "left arm · sitting ·
 * beforeMedication".
 */
function describeContext(r: Reading, t: Dictionary): string {
  const labels = t.form as unknown as Record<string, string>;
  const tags = t.form.tags as unknown as Record<string, string>;

  return [
    // "Linker Arm", not "Links Arm" — German inflects the adjective, so the
    // side label cannot simply be concatenated with the noun.
    r.arm === 'left' ? t.form.leftArm : r.arm === 'right' ? t.form.rightArm : '',
    r.posture ? (labels[r.posture] ?? r.posture) : '',
    r.irregularHeartbeat ? t.form.irregularHeartbeat : '',
    r.tags.map((tag) => tags[tag] ?? tag).join(', '),
    r.note ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildReportHtml(
  readings: Reading[],
  profile: Profile,
  range: DateRange,
  thresholds: ThresholdSet,
  t: Dictionary,
): string {
  const sorted = [...readings].sort((a, b) => a.measuredAt - b.measuredAt);
  const summary = summarise(sorted, thresholds);

  const scaleNote = [
    `${t.categories.low.short} < ${thresholds.low.systolic}/${thresholds.low.diastolic}`,
    ...BOUNDED.map(
      (key) => `${t.categories[key].short} < ${thresholds[key].systolic}/${thresholds[key].diastolic}`,
    ),
  ].join('  ·  ');
  const trend = trendOf(sorted);
  const week = sevenDayAverage(sorted);
  const parts = averagesByDayPart(sorted);

  const periodLabel =
    summary.from && summary.to
      ? `${formatDate(summary.from)} – ${formatDate(summary.to)}`
      : range.label;

  const chart = sorted.length >= 2 ? buildChartSvg(sorted, {
    systolic: t.common.systolic.toLowerCase(),
    diastolic: t.common.diastolic.toLowerCase(),
  }) : '';

  const rows = [...sorted]
    .reverse()
    .map((r) => {
      const category = classify(r.systolic, r.diastolic, thresholds);
      return `
        <tr>
          <td>${esc(formatDate(r.measuredAt))}</td>
          <td>${esc(formatTime(r.measuredAt))}</td>
          <td class="num"><strong>${r.systolic}</strong></td>
          <td class="num"><strong>${r.diastolic}</strong></td>
          <td class="num">${r.pulse ?? '—'}</td>
          <td><span class="tag" style="background:${CATEGORY_COLOURS[category.key]}1a;color:${CATEGORY_COLOURS[category.key]}">${esc(t.categories[category.key].short)}</span></td>
          <td class="meta">${esc(describeContext(r, t))}</td>
        </tr>`;
    })
    .join('');

  const distribution = summary.distribution
    .map(
      (d) => `
        <div class="dist-row">
          <span class="swatch" style="background:${CATEGORY_COLOURS[d.category]}"></span>
          <span class="dist-label">${esc(t.categories[d.category].label)}</span>
          <span class="dist-bar"><span style="width:${(d.share * 100).toFixed(1)}%;background:${CATEGORY_COLOURS[d.category]}"></span></span>
          <span class="dist-value">${d.count} (${Math.round(d.share * 100)}%)</span>
        </div>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.report.title)}</title>
<style>
  @page { margin: 16mm 14mm; }
  /*
   * The report is printed, so it is light regardless of the phone's theme.
   * Without this the WebView that renders the PDF follows the system setting on
   * a dark-mode device and lays dark text over a dark page.
   */
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body {
    font-family: -apple-system, "Helvetica Neue", "Segoe UI", Roboto, sans-serif;
    color: #1a2233; font-size: 11px; line-height: 1.5; margin: 0;
  }
  h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: -0.4px; }
  h2 { font-size: 13px; margin: 22px 0 8px; letter-spacing: -0.2px;
       border-bottom: 1px solid #e2e7f0; padding-bottom: 5px; }
  .sub { color: #5b6577; font-size: 11px; }
  .cards { display: flex; gap: 8px; margin-top: 14px; }
  .card { flex: 1; border: 1px solid #e2e7f0; border-radius: 8px; padding: 9px 11px; }
  .card .k { font-size: 8.5px; letter-spacing: .6px; text-transform: uppercase; color: #8e97a8; }
  .card .v { font-size: 17px; font-weight: 700; margin-top: 2px; letter-spacing: -0.4px; }
  .card .h { font-size: 9.5px; color: #8e97a8; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px;
       color: #8e97a8; border-bottom: 1px solid #cbd3e1; padding: 5px 4px; font-weight: 600; }
  td { padding: 5px 4px; border-bottom: 1px solid #eef1f6; vertical-align: top; }
  td.num { text-align: right; width: 42px; font-variant-numeric: tabular-nums; }
  td.meta { color: #5b6577; font-size: 10px; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 20px;
         font-size: 9px; font-weight: 600; white-space: nowrap; }
  .dist-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
  .dist-label { width: 130px; flex: none; }
  .dist-bar { flex: 1; height: 7px; background: #eef1f6; border-radius: 4px; overflow: hidden; }
  .dist-bar > span { display: block; height: 100%; border-radius: 4px; }
  .dist-value { width: 74px; text-align: right; color: #5b6577; flex: none; }
  .note { margin-top: 20px; padding: 9px 11px; background: #f4f6fa;
          border-radius: 7px; color: #5b6577; font-size: 10px; }
  .foot { margin-top: 14px; color: #8e97a8; font-size: 9px; text-align: center; }
</style>
</head>
<body>
  <h1>${esc(t.report.title)}</h1>
  <div class="sub">
    ${esc(profile.name)} &nbsp;·&nbsp; ${esc(periodLabel)} &nbsp;·&nbsp;
    ${esc(t.common.readingCount(summary.count))}
  </div>

  <div class="cards">
    <div class="card">
      <div class="k">${esc(t.report.average)}</div>
      <div class="v">${Math.round(summary.systolic.mean)}/${Math.round(summary.diastolic.mean)}</div>
      <div class="h">mmHg</div>
    </div>
    <div class="card">
      <div class="k">${esc(t.report.systolicRange)}</div>
      <div class="v">${summary.systolic.min}–${summary.systolic.max}</div>
      <div class="h">sd ±${summary.systolic.sd}</div>
    </div>
    <div class="card">
      <div class="k">${esc(t.report.diastolicRange)}</div>
      <div class="v">${summary.diastolic.min}–${summary.diastolic.max}</div>
      <div class="h">sd ±${summary.diastolic.sd}</div>
    </div>
    ${
      summary.pulse
        ? `<div class="card">
             <div class="k">${esc(t.report.pulse)}</div>
             <div class="v">${Math.round(summary.pulse.mean)}</div>
             <div class="h">${summary.pulse.min}–${summary.pulse.max} bpm</div>
           </div>`
        : ''
    }
  </div>

  ${
    week
      ? `<div class="note"><strong>${esc(t.report.sevenDay(week.systolic, week.diastolic, week.count, week.days))}</strong></div>`
      : ''
  }

  ${chart ? `<h2>${esc(t.report.trend)}</h2>${chart}` : ''}

  <h2>${esc(t.report.distribution)}</h2>
  ${distribution || `<div class="sub">${esc(t.history.emptyPeriodTitle)}</div>`}

  ${
    trend
      ? `<div class="note">${esc(
          t.report.trendNote(
            `${trend.systolicPerWeek > 0 ? '+' : ''}${trend.systolicPerWeek}`,
            `${trend.diastolicPerWeek > 0 ? '+' : ''}${trend.diastolicPerWeek}`,
            trend.fit,
          ),
        )}</div>`
      : ''
  }

  ${
    parts.length > 1
      ? `<h2>${esc(t.report.byTimeOfDay)}</h2>
         <table>
           <tr><th>${esc(t.report.period_)}</th><th>${esc(t.common.readings)}</th><th>${esc(t.report.average)}</th></tr>
           ${parts
             .map(
               (p) =>
                 `<tr><td>${esc(t.dayParts[p.part])}</td>
                      <td>${p.count}</td>
                      <td>${p.systolic}/${p.diastolic} mmHg</td></tr>`,
             )
             .join('')}
         </table>`
      : ''
  }

  <h2>${esc(t.report.allReadings)}</h2>
  <table>
    <thead>
      <tr>
        <th>${esc(t.report.date)}</th><th>${esc(t.report.time)}</th>
        <th style="text-align:right">${esc(t.report.sys)}</th>
        <th style="text-align:right">${esc(t.report.dia)}</th>
        <th style="text-align:right">${esc(t.report.pulse)}</th>
        <th>${esc(t.report.category)}</th><th>${esc(t.report.notes)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!--
    Which thresholds produced the categories above.
    
    Since they became editable this is no longer implied. A report that says
    "grade 1" without saying where grade 1 starts is misleading to the one
    reader who matters here, and the numbers are the part a clinician can check
    against their own scale in a second.
  -->
  <div class="note">${esc(t.report.scaleUsed(scaleNote))}</div>
  <div class="note">${esc(t.report.footerNote)}</div>
  <div class="foot">${esc(t.report.generated(formatDate(Date.now())))}</div>
</body>
</html>`;
}

/** A compact inline SVG line chart, sized for the PDF page. */
function buildChartSvg(
  readings: Reading[],
  legend: { systolic: string; diastolic: string },
): string {
  const width = 520;
  const height = 170;
  const pad = { top: 12, right: 8, bottom: 20, left: 30 };

  const times = readings.map((r) => r.measuredAt);
  const span = Math.max(1, Math.max(...times) - Math.min(...times));
  const buckets = bucketise(readings, chooseBucket(span, 70));

  const values = buckets.flatMap((b) => [b.systolic, b.diastolic]);
  const lo = Math.floor((Math.min(...values) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...values) + 10) / 10) * 10;

  const first = buckets[0].start;
  const last = buckets[buckets.length - 1].start;
  const xSpan = Math.max(1, last - first);

  const px = (t: number) =>
    pad.left + ((t - first) / xSpan) * (width - pad.left - pad.right);
  const py = (v: number) =>
    pad.top + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - pad.top - pad.bottom);

  const line = (pick: (b: (typeof buckets)[number]) => number) =>
    buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${px(b.start).toFixed(1)} ${py(pick(b)).toFixed(1)}`).join(' ');

  const gridStep = Math.max(10, Math.round((hi - lo) / 4 / 10) * 10);
  let grid = '';
  for (let v = lo; v <= hi; v += gridStep) {
    grid += `<line x1="${pad.left}" y1="${py(v).toFixed(1)}" x2="${width - pad.right}" y2="${py(v).toFixed(1)}" stroke="#e2e7f0" stroke-width="1"/>
             <text x="${pad.left - 5}" y="${(py(v) + 3).toFixed(1)}" font-size="8" fill="#8e97a8" text-anchor="end">${v}</text>`;
  }

  const labels = [first, last]
    .map(
      (t, i) =>
        `<text x="${px(t).toFixed(1)}" y="${height - 5}" font-size="8" fill="#8e97a8" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(formatDate(t))}</text>`,
    )
    .join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    <path d="${line((b) => b.systolic)}" fill="none" stroke="#3355E0" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${line((b) => b.diastolic)}" fill="none" stroke="#12B0A0" stroke-width="1.8" stroke-linejoin="round"/>
    ${labels}
    <text x="${width - pad.right}" y="10" font-size="8" fill="#3355E0" text-anchor="end">${esc(legend.systolic)}</text>
    <text x="${width - pad.right - 48}" y="10" font-size="8" fill="#12B0A0" text-anchor="end">${esc(legend.diastolic)}</text>
  </svg>`;
}
