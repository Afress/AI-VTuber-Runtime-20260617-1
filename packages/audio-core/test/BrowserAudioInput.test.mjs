import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../node_modules/typescript/lib/typescript.js";

globalThis.window = {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

const sourcePath = new URL("../src/index.ts", import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-core-input-test-"));
const compiledModulePath = join(temporaryDirectory, "audio-core.mjs");
const source = await readFile(sourcePath, "utf8");
const compiled = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2020,
  },
  fileName: "index.ts",
});
await writeFile(compiledModulePath, compiled.outputText, "utf8");
const { BrowserAudioInput, calculateAudioInputLevel } = await import(pathToFileURL(compiledModulePath).href);

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

class FakeNode {
  connect() {}
  disconnect() {}
}

class FakeAnalyser extends FakeNode {
  constructor(samples = [128, 128, 128, 128]) {
    super();
    this.fftSize = 4;
    this.samples = samples;
  }
  getByteTimeDomainData(target) {
    target.set(this.samples.slice(0, target.length));
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.analyser = new FakeAnalyser();
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createAnalyser() {
    return this.analyser;
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}
FakeAudioContext.instances = [];

function createTrack(deviceId = "default") {
  const listeners = new Set();
  return {
    readyState: "live",
    enabled: true,
    stopCount: 0,
    getSettings: () => ({ deviceId, channelCount: 1 }),
    stop() {
      this.stopCount += 1;
      this.readyState = "ended";
    },
    addEventListener(type, listener) {
      if (type === "ended") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "ended") listeners.delete(listener);
    },
    end() {
      this.readyState = "ended";
      for (const listener of listeners) listener();
    },
  };
}

function createStream(deviceId = "default") {
  const track = createTrack(deviceId);
  return {
    track,
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

function createMediaDevices({ devices, getUserMedia } = {}) {
  const listeners = new Set();
  return {
    devices: devices ?? [{ kind: "audioinput", deviceId: "default", groupId: "group", label: "" }],
    getUserMediaCalls: [],
    async getUserMedia(constraints) {
      this.getUserMediaCalls.push(constraints);
      return getUserMedia ? getUserMedia(constraints) : createStream(constraints.audio.deviceId?.exact ?? "default");
    },
    async enumerateDevices() {
      return this.devices;
    },
    addEventListener(type, listener) {
      if (type === "devicechange") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "devicechange") listeners.delete(listener);
    },
    emitDeviceChange() {
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function createInput(mediaDevices = createMediaDevices()) {
  return new BrowserAudioInput({
    mediaDevices,
    AudioContextConstructor: FakeAudioContext,
    secureContext: true,
    now: () => 100,
  });
}

test("level calculation reports RMS, normalized value, peak, and clipping", () => {
  assert.deepEqual(calculateAudioInputLevel(new Uint8Array([128, 128]), 1), {
    raw: 0,
    normalized: 0,
    peak: 0,
    clipped: false,
    timestamp: 1,
  });
  const level = calculateAudioInputLevel(new Uint8Array([0, 255]), 2);
  assert.ok(level.raw > 0.98);
  assert.equal(level.normalized, 1);
  assert.ok(level.peak > 0.99);
  assert.equal(level.clipped, true);
});

test("unsupported input reports a safe error without requesting media", async () => {
  const input = new BrowserAudioInput({ secureContext: true });
  await assert.rejects(() => input.start(), /not supported/);
  assert.equal(input.getSnapshot().permission, "unsupported");
  assert.equal(input.getSnapshot().status, "error");
});

test("start, duplicate start, mute, and stop manage one stream", async () => {
  const mediaDevices = createMediaDevices();
  const input = createInput(mediaDevices);
  await input.start();
  const firstStream = input.stream;
  assert.equal(input.getSnapshot().status, "active");
  assert.equal(input.getSnapshot().activeTrackCount, 1);
  await input.start();
  assert.equal(mediaDevices.getUserMediaCalls.length, 1);

  input.setMuted(true);
  assert.equal(input.getSnapshot().status, "muted");
  assert.equal(firstStream.track.enabled, false);
  input.setMuted(false);
  assert.equal(firstStream.track.enabled, true);

  await input.stop();
  assert.equal(firstStream.track.stopCount, 1);
  assert.equal(input.getSnapshot().status, "idle");
  assert.equal(input.getSnapshot().activeTrackCount, 0);
  assert.equal(input.getSnapshot().level.raw, 0);
  await input.stop();
  await input.dispose();
});

test("permission denied and device busy errors are understandable", async () => {
  const denied = createInput(createMediaDevices({
    getUserMedia: async () => {
      throw new DOMException("Denied", "NotAllowedError");
    },
  }));
  await assert.rejects(() => denied.start(), /Denied/);
  assert.equal(denied.getSnapshot().permission, "denied");
  assert.match(denied.getSnapshot().error.message, /permission was denied/i);

  const busy = createInput(createMediaDevices({
    getUserMedia: async () => {
      throw new DOMException("Busy", "NotReadableError");
    },
  }));
  await assert.rejects(() => busy.start(), /Busy/);
  assert.match(busy.getSnapshot().error.message, /unavailable or already in use/i);

  const missing = createInput(createMediaDevices({
    getUserMedia: async () => {
      throw new DOMException("No microphone", "NotFoundError");
    },
  }));
  await assert.rejects(() => missing.start(), /No microphone/);
  assert.match(missing.getSnapshot().error.message, /No microphone input device/i);
});

test("requestPermission releases its temporary stream and exposes device labels", async () => {
  let temporaryStream;
  const mediaDevices = createMediaDevices({
    devices: [{ kind: "audioinput", deviceId: "default", groupId: "g", label: "Desk microphone" }],
    getUserMedia: async () => {
      temporaryStream = createStream();
      return temporaryStream;
    },
  });
  const input = createInput(mediaDevices);
  await input.requestPermission();
  assert.equal(temporaryStream.track.stopCount, 1);
  assert.equal(input.getSnapshot().permission, "granted");
  assert.equal(input.getSnapshot().devices[0].label, "Desk microphone");
  await input.dispose();
});

test("device enumeration uses fallback labels and switching preserves a usable session", async () => {
  const streams = [];
  const mediaDevices = createMediaDevices({
    devices: [
      { kind: "audioinput", deviceId: "one", groupId: "a", label: "" },
      { kind: "audioinput", deviceId: "two", groupId: "b", label: "Studio mic" },
    ],
    getUserMedia: async (constraints) => {
      const stream = createStream(constraints.audio.deviceId?.exact ?? "one");
      streams.push(stream);
      return stream;
    },
  });
  const input = createInput(mediaDevices);
  const devices = await input.enumerateDevices();
  assert.equal(devices[0].label, "Microphone 1");
  await input.start("one");
  await input.selectDevice("two");
  assert.equal(input.getSnapshot().selectedDeviceId, "two");
  assert.equal(streams[0].track.stopCount, 1);
  assert.equal(input.getSnapshot().activeTrackCount, 1);
  await input.dispose();
});

test("devicechange refreshes devices and dispose removes listeners", async () => {
  const mediaDevices = createMediaDevices();
  const input = createInput(mediaDevices);
  await input.enumerateDevices();
  mediaDevices.devices = [{ kind: "audioinput", deviceId: "usb", groupId: "usb", label: "USB mic" }];
  mediaDevices.emitDeviceChange();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input.getSnapshot().deviceChangeCount, 1);
  assert.equal(input.getSnapshot().devices[0].deviceId, "usb");
  await input.dispose();
  assert.equal(mediaDevices.listenerCount(), 0);
});

test("removing the active device falls back to the browser default input", async () => {
  const streams = [];
  const mediaDevices = createMediaDevices({
    devices: [{ kind: "audioinput", deviceId: "usb", groupId: "usb", label: "USB mic" }],
    getUserMedia: async (constraints) => {
      const stream = createStream(constraints.audio.deviceId?.exact ?? "default");
      streams.push(stream);
      return stream;
    },
  });
  const input = createInput(mediaDevices);
  await input.start("usb");
  mediaDevices.devices = [{ kind: "audioinput", deviceId: "default", groupId: "g", label: "Default mic" }];
  mediaDevices.emitDeviceChange();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(streams[0].track.stopCount, 1);
  assert.equal(input.getSnapshot().selectedDeviceId, "default");
  assert.equal(input.getSnapshot().status, "active");
  await input.dispose();
});

test("stop during an unresolved start prevents a late stream from becoming active", async () => {
  let resolveRequest;
  const mediaDevices = createMediaDevices({
    getUserMedia: () => new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  });
  const input = createInput(mediaDevices);
  const start = input.start();
  await input.stop();
  const lateStream = createStream();
  resolveRequest(lateStream);
  await start;
  assert.equal(lateStream.track.stopCount, 1);
  assert.equal(input.getSnapshot().status, "idle");
  await input.dispose();
});
