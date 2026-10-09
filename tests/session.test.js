import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCSV, summarize } from '../web/session.js';
import { createServer } from '../scripts/serve.mjs';
test('CSV escapes labels, formula prefixes and missing calibration', () => {
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(-5), '"-5"');
  assert.ok(toCSV([{label:'a,b',raw_adc:42}]).includes('"a,b"'));
  assert.equal(csvCell(null),'""');
});
test('summary keeps channel identity separate from repeated muscle labels', () => {
  const data = summarize([{channel:'a',label:'Biceps',rms_adc:2,clipped:false},{channel:'a',label:'Biceps',rms_adc:4,clipped:true},{channel:'b',label:'Biceps',rms_adc:8,clipped:false}]);
  assert.equal(data.length,2); assert.equal(data[0].meanRms,3); assert.equal(data[0].clipped,1);
});
test('local server serves the app and rejects private files and writes', async () => {
  const server = await createServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base)).status,200);
    assert.notEqual((await fetch(base+'/package.json')).status,200);
    assert.notEqual((await fetch(base+'/%2e%2e/package.json')).status,200);
    assert.equal((await fetch(base,{method:'POST'})).status,405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
