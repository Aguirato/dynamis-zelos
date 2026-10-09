import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../web/core.js';
import * as session from '../web/session.js';

// Exercise the browser controller with a minimal DOM and delayed IndexedDB.
// The production module stays unchanged; only imports are supplied by this
// isolated harness so real packet, processing and export code is used.
const source = (await readFile(new URL('../web/app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');

function controller() {
  const elements = new Map();
  const drawCalls = [];
  const context = {
    setTransform() {}, clearRect() {}, beginPath() {}, stroke() {}, fillText() {},
    moveTo(x, y) { drawCalls.push({ type: 'move', x, y }); },
    lineTo(x, y) { drawCalls.push({ type: 'line', x, y }); },
  };
  function element(tag = 'div') {
    return {
      tag, children: [], textContent: '', value: '', style: {}, disabled: false,
      classList: { toggle() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; },
      getBoundingClientRect() { return { width: 500, height: 200 }; },
      getContext() { return context; },
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
    createTextNode(text) { return { textContent: text }; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  let now = 0, id = 0;
  const openRequest = {};
  const saved = [];
  const database = {
    transaction() {
      const transaction = {
        objectStore() {
          return {
            getAll() { return { result: [] }; },
            put(record) { saved.push(record); queueMicrotask(() => transaction.oncomplete?.()); },
          };
        },
      };
      return transaction;
    },
  };
  const sandbox = {
    ...core, ...session, document, navigator: {},
    window: { isSecureContext: true, addEventListener() {} },
    performance: { now: () => now }, crypto: { randomUUID: () => `session-${++id}` },
    indexedDB: { open: () => openRequest }, requestAnimationFrame() {},
    devicePixelRatio: 1, setTimeout, URL, Blob,
  };
  vm.runInNewContext(`${source}\nglobalThis.hooks = {
    makeChannel, consume, startRecording, stopRecording, paint, drawChart,
    getState: () => ({ channels, recording, latest, history }),
    useChannels: next => { channels = next; renderChannels(); }
  };`, sandbox, { filename: 'app.js' });
  return {
    hooks: sandbox.hooks, elements, saved, drawCalls,
    setNow(value) { now = value; },
    openDatabase() { openRequest.result = database; openRequest.onsuccess(); },
  };
}

function warm(app) {
  app.setNow(500);
  for (const channel of app.hooks.getState().channels) {
    for (let index = 0; index < 20; index++) app.hooks.consume(channel, channel.generator.nextPacket());
  }
}

test('waiting channels do not look active or clipped before their first sample', () => {
  const app = controller();
  app.hooks.paint(0);
  assert.equal(app.elements.get('channel-count').children[0].textContent, '00');
  assert.ok(app.hooks.getState().channels.every(c => c.ui.quality.textContent === 'No recent data'));
  warm(app);
  app.hooks.paint(500);
  assert.ok(app.hooks.getState().channels.every(c => !c.ui.quality.textContent.includes('Clipping')));
});

test('two captures stopped before storage opens each persist their own contents', async () => {
  const app = controller();
  warm(app);
  const channel = app.hooks.getState().channels[0];
  app.hooks.startRecording();
  app.hooks.consume(channel, channel.generator.nextPacket());
  const first = app.hooks.stopRecording();
  app.hooks.startRecording();
  app.hooks.consume(channel, channel.generator.nextPacket());
  app.hooks.consume(channel, channel.generator.nextPacket());
  const second = app.hooks.stopRecording();
  app.openDatabase();
  await Promise.all([first, second]);
  assert.deepEqual(app.saved.map(capture => capture.id), ['session-1', 'session-2']);
  assert.deepEqual(app.saved.map(capture => capture.count), [5, 10]);
  assert.notEqual(app.saved[0].csv, app.saved[1].csv);
});

test('a timing or sequence gap resets filters and aborts reference capture', () => {
  const app = controller();
  warm(app);
  const channel = app.hooks.getState().channels[0];
  channel.calibration = { rms: [30], remaining: 20 };
  const packet = channel.generator.nextPacket();
  packet.sequence += 2;
  packet.timestampUs += 10000;
  app.hooks.consume(channel, packet);
  assert.equal(channel.processor.sampleCount, 5);
  assert.equal(channel.result.ready, false);
  assert.equal(channel.calibration, null);
  assert.equal(channel.processor.referenceRms, 150);
  assert.equal(channel.dropped, 2);
  assert.equal(channel.timingGaps, 1);
  assert.ok(channel.trace.some(point => point.value === null));
  assert.match(app.elements.get('notice').textContent, /Reference capture cancelled/);
});

test('late and duplicate notifications are counted separately without making samples', () => {
  const app = controller();
  const channel = app.hooks.getState().channels[0];
  const packet = channel.generator.nextPacket();
  app.hooks.consume(channel, packet);
  app.hooks.consume(channel, packet);
  app.hooks.consume(channel, { ...packet, sequence: 65535, timestampUs: 0xffffec78 });
  assert.equal(channel.duplicates, 1);
  assert.equal(channel.outOfOrder, 1);
  assert.equal(channel.trace.length, 5);
});

test('recorded device timestamps stay unwrapped and skip actual missing time', () => {
  const app = controller();
  const channel = app.hooks.makeChannel('test', 'Bench input', 0);
  app.hooks.useChannels([channel]);
  app.setNow(500);
  for (let index = 0; index < 20; index++) app.hooks.consume(channel, {
    sequence: 65515 + index, timestampUs: (0xffff0000 + index * 5000) >>> 0,
    sampleRate: 1000, samples: [2048, 2200, 2048, 1900, 2048],
  });
  app.hooks.startRecording();
  app.hooks.consume(channel, {
    sequence: 0, timestampUs: (0xffff0000 + 21 * 5000) >>> 0,
    sampleRate: 1000, samples: [2048, 2200, 2048, 1900, 2048],
  });
  const { recording } = app.hooks.getState();
  assert.equal(recording.rows.length, 5);
  assert.equal(recording.rows[0].device_time_us, 0xffff0000 + 105000);
  assert.equal(recording.rows[4].device_time_us, 0xffff0000 + 109000);
  assert.equal(channel.dropped, 1);
});

test('session transport counters exclude events before recording began', async () => {
  const app = controller();
  warm(app);
  const channel = app.hooks.getState().channels[0];
  channel.errors = 3;
  channel.duplicates = 4;
  app.hooks.startRecording();
  channel.errors += 1;
  channel.duplicates += 2;
  app.hooks.consume(channel, channel.generator.nextPacket());
  const complete = app.hooks.stopRecording();
  app.openDatabase();
  await complete;
  assert.equal(app.saved[0].transport[0].invalid, 1);
  assert.equal(app.saved[0].transport[0].duplicates, 2);
});

test('chart geometry uses device time and does not join a gap during downsampling', () => {
  const app = controller();
  const channel = app.hooks.getState().channels[0];
  channel.lastSeen = 500;
  // The gap marker has an odd index and must not disappear in step-3 drawing.
  channel.trace = [
    { timeUs: 0, value: 10 }, { timeUs: 1000, value: null },
    { timeUs: 2000000, value: 20 }, { timeUs: 2001000, value: 30 },
  ];
  app.hooks.drawChart(500);
  const points = app.drawCalls.slice(24); // 5 horizontal + 7 vertical grid lines.
  assert.equal(points[0].type, 'move');
  assert.equal(points[1].type, 'move');
  assert.ok(points[1].x - points[0].x > 300);
  assert.equal(points.at(-1).x, 500);
});
