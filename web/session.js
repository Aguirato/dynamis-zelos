export const CSV_COLUMNS = ['session_id','source','channel','label','packet_sequence','device_time_us','host_elapsed_ms','raw_adc','filtered_adc','rms_adc','reference_rms_adc','relative_reference_percent','clipped'];
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCSV(rows) { return CSV_COLUMNS.join(',') + '\r\n' + rows.map(row => CSV_COLUMNS.map(key => csvCell(row[key])).join(',')).join('\r\n'); }
export function summarize(rows) {
  const channels = new Map();
  for (const row of rows) {
    const key = row.channel;
    const stats = channels.get(key) || {channel:key,label:row.label,samples:0,sum:0,peak:0,clipped:0};
    stats.samples++; stats.sum += row.rms_adc; stats.peak = Math.max(stats.peak, row.rms_adc); stats.clipped += Number(row.clipped);
    channels.set(key,stats);
  }
  return [...channels.values()].map(({sum,...s}) => ({...s,meanRms:sum/s.samples}));
}
