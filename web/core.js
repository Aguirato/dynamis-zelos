/**
 * DYNAMIS ZELOS transport and signal utilities.
 *
 * Signal amplitudes are ADC counts, not volts, force, or muscle recruitment.
 * The prototype pipeline uses first-order bilinear (prewarped) 20 Hz high-pass
 * and 400 Hz low-pass filters followed by a 100 ms rolling RMS. This simple
 * digital pipeline is not a substitute for the analog anti-aliasing filter.
 * It is intentionally transparent and is not a validated clinical algorithm.
 */

export const SERVICE_UUID = "8f7e1000-6f4b-4a3e-9e9a-3c7b2d1a0001";
export const CHARACTERISTIC_UUID = "8f7e1001-6f4b-4a3e-9e9a-3c7b2d1a0001";
export const PROTOCOL_VERSION = 1;
export const PACKET_BYTES = 20;
export const SAMPLES_PER_PACKET = 5;
export const SAMPLE_RATE = 1000;
export const ADC_MAX = 4095;

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

/** Decode one complete notification. Reject malformed or incompatible input. */
export function parsePacket(input) {
  let view;
  if (input instanceof DataView) {
    view = input;
  } else if (input instanceof Uint8Array) {
    view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError("Packet must be a DataView or Uint8Array.");
  }
  if (view.byteLength !== PACKET_BYTES) {
    throw new RangeError(`Packet must contain exactly ${PACKET_BYTES} bytes.`);
  }
  if (view.getUint8(0) !== PROTOCOL_VERSION) {
    throw new RangeError("Unsupported packet version; expected version 1.");
  }
  if (view.getUint8(1) !== SAMPLES_PER_PACKET) {
    throw new RangeError("Version 1 packets must contain exactly five samples.");
  }
  const sampleRate = view.getUint16(8, true);
  if (sampleRate !== SAMPLE_RATE) {
    throw new RangeError("Version 1 requires a sample rate of 1000 Hz.");
  }
  const samples = Array.from({ length: SAMPLES_PER_PACKET }, (_, index) =>
    integerInRange(view.getUint16(10 + index * 2, true), 0, ADC_MAX, "ADC sample"),
  );
  return {
    version: PROTOCOL_VERSION,
    sequence: view.getUint16(2, true),
    timestampUs: view.getUint32(4, true),
    sampleRate,
    samples,
  };
}

/** Encode an object using the same fixed, little-endian notification format. */
export function encodePacket({ sequence, timestampUs, samples, sampleRate = SAMPLE_RATE }) {
  integerInRange(sequence, 0, 0xffff, "Sequence");
  integerInRange(timestampUs, 0, 0xffffffff, "Timestamp");
  if (sampleRate !== SAMPLE_RATE) {
    throw new RangeError("Version 1 requires a sample rate of 1000 Hz.");
  }
  if (!(Array.isArray(samples) || samples instanceof Uint16Array) || samples.length !== SAMPLES_PER_PACKET) {
    throw new RangeError("Exactly five ADC samples are required.");
  }
  const bytes = new Uint8Array(PACKET_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, SAMPLES_PER_PACKET);
  view.setUint16(2, sequence, true);
  view.setUint32(4, timestampUs, true);
  view.setUint16(8, sampleRate, true);
  for (let index = 0; index < SAMPLES_PER_PACKET; index += 1) {
    view.setUint16(10 + index * 2, integerInRange(samples[index], 0, ADC_MAX, "ADC sample"), true);
  }
  return bytes;
}

/**
 * Maintain one tracker per connection. Call reset() on every reconnect/reboot.
 * Sequence and timer rollover use modular forward differences. A gap of half
 * the sequence range (163.84 seconds at 200 packets/s) or more is ambiguous:
 * reset/reconnect after such an interruption instead of guessing continuity.
 * Separate trackers do not synchronize the clocks of separate sensor devices.
 */
export class PacketTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.lastSequence = null;
    this.lastTimestamp = null;
    this.unwrappedTimestamp = null;
    this.totalDropped = 0;
    this.totalDuplicates = 0;
    this.totalOutOfOrder = 0;
  }

  update({ sequence, timestampUs }) {
    integerInRange(sequence, 0, 0xffff, "Sequence");
    integerInRange(timestampUs, 0, 0xffffffff, "Timestamp");
    const status = {
      accepted: false,
      duplicate: false,
      outOfOrder: false,
      dropped: 0,
      totalDropped: this.totalDropped,
      timestampUs: null,
    };
    if (this.lastSequence !== null) {
      const sequenceDelta = (sequence - this.lastSequence + 0x10000) % 0x10000;
      const timeDelta = (timestampUs - this.lastTimestamp) >>> 0;
      if (sequenceDelta === 0) {
        this.totalDuplicates += 1;
        return { ...status, duplicate: true };
      }
      if (sequenceDelta >= 0x8000 || timeDelta === 0 || timeDelta >= 0x80000000) {
        this.totalOutOfOrder += 1;
        return { ...status, outOfOrder: true };
      }
      status.dropped = sequenceDelta - 1;
      this.totalDropped += status.dropped;
      this.unwrappedTimestamp += timeDelta;
    } else {
      this.unwrappedTimestamp = timestampUs;
    }
    this.lastSequence = sequence;
    this.lastTimestamp = timestampUs;
    return {
      ...status,
      accepted: true,
      totalDropped: this.totalDropped,
      timestampUs: this.unwrappedTimestamp,
    };
  }
}

/** Stateful single-channel, streaming ADC-count processing. */
export class SignalProcessor {
  constructor(sampleRate = SAMPLE_RATE) {
    integerInRange(sampleRate, 801, 100000, "Sample rate");
    this.sampleRate = sampleRate;
    this.windowSize = Math.round(sampleRate * 0.1);
    const highpassK = Math.tan(Math.PI * 20 / sampleRate);
    const lowpassK = Math.tan(Math.PI * 400 / sampleRate);
    this.highpassB = 1 / (1 + highpassK);
    this.highpassA = (1 - highpassK) / (1 + highpassK);
    this.lowpassB = lowpassK / (1 + lowpassK);
    this.lowpassA = (1 - lowpassK) / (1 + lowpassK);
    this.referenceRms = null;
    this.reset();
  }

  /** Clear filter history; keep the explicit calibration reference. */
  reset() {
    this.previousRaw = null;
    this.previousHighpass = 0;
    this.previousLowpass = 0;
    this.squares = new Float64Array(this.windowSize);
    this.squareSum = 0;
    this.windowIndex = 0;
    this.sampleCount = 0;
  }

  /** Reference is a measured RMS in the same ADC units, not a medical norm. */
  setReference(value) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      throw new RangeError("Reference RMS must be a finite positive number, or null to clear it.");
    }
    this.referenceRms = value;
  }

  push(raw) {
    integerInRange(raw, 0, ADC_MAX, "ADC sample");
    if (this.previousRaw === null) this.previousRaw = raw;
    const highpass = this.highpassB * (raw - this.previousRaw) + this.highpassA * this.previousHighpass;
    const filtered = this.lowpassB * (highpass + this.previousHighpass) + this.lowpassA * this.previousLowpass;
    this.previousRaw = raw;
    this.previousHighpass = highpass;
    this.previousLowpass = filtered;

    const square = filtered * filtered;
    this.squareSum += square - this.squares[this.windowIndex];
    this.squares[this.windowIndex] = square;
    this.windowIndex = (this.windowIndex + 1) % this.windowSize;
    this.sampleCount += 1;
    // Roundoff can leave a tiny negative remainder after a long quiet period.
    const rms = Math.sqrt(Math.max(0, this.squareSum) / Math.min(this.sampleCount, this.windowSize));
    return {
      filtered,
      rms,
      clipped: raw === 0 || raw === ADC_MAX,
      activation: this.referenceRms === null ? null : 100 * rms / this.referenceRms,
      ready: this.sampleCount >= this.windowSize,
    };
  }
}

/** Reproducible synthetic samples for demonstration and automated testing. */
export class DemoGenerator {
  constructor({ seed = 1, sampleRate = SAMPLE_RATE, channel = 0 } = {}) {
    integerInRange(seed, 0, 0xffffffff, "Seed");
    if (sampleRate !== SAMPLE_RATE) throw new RangeError("Demo packets use 1000 Hz.");
    integerInRange(channel, 0, 7, "Channel");
    this.seed = seed;
    this.sampleRate = sampleRate;
    this.channel = channel;
    this.reset();
  }

  reset() {
    this.state = (this.seed ^ Math.imul(this.channel + 1, 0x9e3779b9)) >>> 0 || 1;
    this.sampleIndex = 0;
    this.sequence = 0;
  }

  next() {
    let state = this.state;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.state = state >>> 0;
    const noise = this.state / 0x100000000 * 2 - 1;
    const time = this.sampleIndex / this.sampleRate;
    const phase = this.channel * 0.43;
    const cycle = (time + this.channel * 0.7) % 7;
    const envelope = cycle < 1.5 || cycle > 5.5 ? 0.08 : Math.sin(Math.PI * (cycle - 1.5) / 4) ** 2;
    const carrier = Math.sin(2 * Math.PI * 90 * time + phase)
      + 0.45 * Math.sin(2 * Math.PI * 147 * time + phase * 2)
      + 0.2 * Math.sin(2 * Math.PI * 231 * time);
    const baseline = 2048 + 18 * Math.sin(2 * Math.PI * 0.25 * time);
    const raw = baseline + (35 + 430 * envelope) * carrier + 22 * noise;
    this.sampleIndex += 1;
    return Math.max(0, Math.min(ADC_MAX, Math.round(raw)));
  }

  nextPacket() {
    const timestampUs = (this.sampleIndex * 1000) >>> 0;
    const packet = {
      version: PROTOCOL_VERSION,
      sequence: this.sequence,
      timestampUs,
      sampleRate: this.sampleRate,
      samples: Array.from({ length: SAMPLES_PER_PACKET }, () => this.next()),
    };
    this.sequence = (this.sequence + 1) % 0x10000;
    return packet;
  }
}
