import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePacket, encodePacket, PacketTracker, SignalProcessor, DemoGenerator,
  SERVICE_UUID, CHARACTERISTIC_UUID,
} from "../web/core.js";

function packet(overrides = {}) {
  return { sequence: 513, timestampUs: 0x12345678, samples: [0, 1, 2048, 4094, 4095], ...overrides };
}

test("protocol is exactly 20 bytes and uses documented little-endian fields", () => {
  const bytes = encodePacket(packet());
  assert.equal(bytes.length, 20);
  assert.deepEqual([...bytes], [1, 5, 1, 2, 0x78, 0x56, 0x34, 0x12, 0xe8, 3, 0, 0, 1, 0, 0, 8, 0xfe, 15, 0xff, 15]);
  assert.deepEqual(parsePacket(bytes), { version: 1, sampleRate: 1000, ...packet() });
  assert.notEqual(SERVICE_UUID, CHARACTERISTIC_UUID);
});

test("packet parser respects subview offsets", () => {
  const memory = new Uint8Array(40);
  memory.set(encodePacket(packet()), 7);
  assert.deepEqual(parsePacket(memory.subarray(7, 27)).samples, packet().samples);
  assert.equal(parsePacket(new DataView(memory.buffer, 7, 20)).timestampUs, 0x12345678);
});

test("packet parser rejects truncated, oversized and invalid input types", () => {
  for (const length of [0, 10, 19, 21, 40]) assert.throws(() => parsePacket(new Uint8Array(length)), RangeError);
  for (const input of [null, [], new ArrayBuffer(20), new Uint16Array(10)]) assert.throws(() => parsePacket(input), TypeError);
});

test("packet parser rejects unknown versions, counts, rates and samples", () => {
  for (const [offset, value, wide] of [[0, 2, false], [1, 4, false], [8, 500, true], [10, 4096, true]]) {
    const bytes = encodePacket(packet());
    const view = new DataView(bytes.buffer);
    if (wide) view.setUint16(offset, value, true);
    else view.setUint8(offset, value);
    assert.throws(() => parsePacket(bytes), RangeError);
  }
});

test("encoder rejects values that would otherwise silently wrap or truncate", () => {
  for (const overrides of [
    { sequence: -1 }, { sequence: 65536 }, { sequence: 1.2 },
    { timestampUs: -1 }, { timestampUs: 0x100000000 }, { timestampUs: NaN },
    { sampleRate: 500 }, { samples: [] }, { samples: new Array(5) }, { samples: [0, 1, 2, 3, 4096] },
    { samples: [0, 1, 2, 3, -1] }, { samples: [0, 1, 2, 3, 1.5] },
  ]) assert.throws(() => encodePacket(packet(overrides)), RangeError);
});

test("sequence gaps count missing packets without fabricating samples", () => {
  const tracker = new PacketTracker();
  assert.equal(tracker.update({ sequence: 10, timestampUs: 100000 }).accepted, true);
  assert.deepEqual(tracker.update({ sequence: 13, timestampUs: 115000 }), {
    accepted: true, duplicate: false, outOfOrder: false, dropped: 2, totalDropped: 2, timestampUs: 115000,
  });
  assert.equal(tracker.update({ sequence: 15, timestampUs: 125000 }).totalDropped, 3);
});

test("sequence and microsecond timestamp wrap are independent and supported", () => {
  const tracker = new PacketTracker();
  tracker.update({ sequence: 65535, timestampUs: 0xfffff000 });
  const status = tracker.update({ sequence: 0, timestampUs: (0xfffff000 + 5000) >>> 0 });
  assert.equal(status.accepted, true);
  assert.equal(status.dropped, 0);
  assert.equal(status.timestampUs, 0xfffff000 + 5000);
});

test("duplicates and late notifications do not advance the accepted clock", () => {
  const tracker = new PacketTracker();
  tracker.update({ sequence: 200, timestampUs: 1000000 });
  assert.equal(tracker.update({ sequence: 200, timestampUs: 1000000 }).duplicate, true);
  assert.equal(tracker.update({ sequence: 199, timestampUs: 995000 }).outOfOrder, true);
  assert.equal(tracker.update({ sequence: 201, timestampUs: 995000 }).outOfOrder, true);
  const accepted = tracker.update({ sequence: 201, timestampUs: 1005000 });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.dropped, 0);
  assert.equal(tracker.totalDuplicates, 1);
  assert.equal(tracker.totalOutOfOrder, 2);
});

test("tracker reset establishes a new clock on reconnect", () => {
  const tracker = new PacketTracker();
  tracker.update({ sequence: 400, timestampUs: 3000000 });
  tracker.update({ sequence: 402, timestampUs: 3010000 });
  tracker.reset();
  assert.deepEqual(tracker.update({ sequence: 0, timestampUs: 0 }), {
    accepted: true, duplicate: false, outOfOrder: false, dropped: 0, totalDropped: 0, timestampUs: 0,
  });
});

test("tracker rejects ambiguous half-range sequence jumps", () => {
  const tracker = new PacketTracker();
  tracker.update({ sequence: 0, timestampUs: 0 });
  assert.equal(tracker.update({ sequence: 32768, timestampUs: 163840000 }).outOfOrder, true);
});

test("steady DC is suppressed from the first sample", () => {
  const processor = new SignalProcessor();
  let last;
  for (let index = 0; index < 2000; index += 1) last = processor.push(2048);
  assert.equal(last.filtered, 0);
  assert.equal(last.rms, 0);
  assert.equal(last.ready, true);
  assert.equal(last.activation, null);
});

function sineRms(frequency, amplitude = 500, count = 3000) {
  const processor = new SignalProcessor();
  let last;
  for (let index = 0; index < count; index += 1) {
    last = processor.push(Math.round(2048 + amplitude * Math.sin(2 * Math.PI * frequency * index / 1000)));
  }
  return last.rms;
}

test("100 Hz sine RMS matches the independently derived filter response", () => {
  const frequency = 100;
  const amplitude = 500;
  const warped = Math.tan(Math.PI * frequency / 1000);
  const hpCutoff = Math.tan(Math.PI * 20 / 1000);
  const lpCutoff = Math.tan(Math.PI * 400 / 1000);
  const gain = warped / Math.hypot(warped, hpCutoff) * lpCutoff / Math.hypot(warped, lpCutoff);
  const expected = amplitude / Math.sqrt(2) * gain;
  assert.ok(Math.abs(sineRms(frequency, amplitude) - expected) < 0.5);
});

test("pipeline attenuates baseline drift and frequencies near Nyquist", () => {
  const passband = sineRms(100);
  assert.ok(sineRms(2) < passband * 0.15);
  assert.ok(sineRms(490) < passband * 0.12);
});

test("RMS uses a finite rolling window and becomes ready after 100 ms", () => {
  const processor = new SignalProcessor();
  for (let index = 0; index < 99; index += 1) assert.equal(processor.push(2048).ready, false);
  assert.equal(processor.push(2500).ready, true);
  let last;
  for (let index = 0; index < 3000; index += 1) last = processor.push(2048);
  assert.ok(last.rms < 0.001);
});

test("explicit RMS references produce uncapped relative percentages", () => {
  const processor = new SignalProcessor();
  processor.setReference(100);
  let last;
  for (let index = 0; index < 2000; index += 1) last = processor.push(Math.round(2048 + 500 * Math.sin(2 * Math.PI * 100 * index / 1000)));
  assert.equal(last.activation, last.rms);
  assert.ok(last.activation > 100);
  processor.reset();
  assert.equal(processor.referenceRms, 100);
  assert.equal(processor.push(2048).activation, 0);
  processor.setReference(null);
  assert.equal(processor.push(2048).activation, null);
});

test("invalid references, samples and unsupported filter rates are rejected", () => {
  const processor = new SignalProcessor();
  for (const value of [0, -1, NaN, Infinity, "100", undefined]) assert.throws(() => processor.setReference(value), RangeError);
  for (const value of [-1, 4096, 2.5, NaN, Infinity]) assert.throws(() => processor.push(value), RangeError);
  for (const value of [0, 500, 800, NaN]) assert.throws(() => new SignalProcessor(value), RangeError);
});

test("ADC rail detection is separate from the filtered amplitude", () => {
  const processor = new SignalProcessor();
  assert.equal(processor.push(0).clipped, true);
  assert.equal(processor.push(4095).clipped, true);
  assert.equal(processor.push(2048).clipped, false);
});

test("demo is deterministic, resettable, bounded and distinct per channel", () => {
  const first = new DemoGenerator({ seed: 42 });
  const second = new DemoGenerator({ seed: 42 });
  const other = new DemoGenerator({ seed: 42, channel: 1 });
  const samples = Array.from({ length: 8000 }, () => first.next());
  assert.deepEqual(samples, Array.from({ length: 8000 }, () => second.next()));
  assert.notDeepEqual(samples.slice(0, 100), Array.from({ length: 100 }, () => other.next()));
  assert.ok(samples.every(value => Number.isInteger(value) && value >= 0 && value <= 4095));
  first.reset();
  assert.deepEqual(samples.slice(0, 100), Array.from({ length: 100 }, () => first.next()));
});

test("demo packets round-trip through the real transport parser", () => {
  const demo = new DemoGenerator();
  const tracker = new PacketTracker();
  const processor = new SignalProcessor();
  for (let index = 0; index < 1000; index += 1) {
    const generated = demo.nextPacket();
    const parsed = parsePacket(encodePacket(generated));
    assert.deepEqual(parsed, generated);
    assert.equal(parsed.sequence, index);
    assert.equal(parsed.timestampUs, index * 5000);
    assert.equal(tracker.update(parsed).accepted, true);
    for (const sample of parsed.samples) assert.ok(Number.isFinite(processor.push(sample).rms));
  }
  assert.equal(tracker.totalDropped, 0);
});
