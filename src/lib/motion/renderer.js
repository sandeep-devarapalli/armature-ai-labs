// Independent local study of the public General Intuition ASCII rendering settings.
const DENSITY = String.raw`$@B%8&WM#*oahkbdpqwmZO0QLCJUYZXcvunxrj/ft\|()1{}[]?_-+~<>i!lI;:",^'. `;
const DEFAULTS = {
  cellSize: 10, cellAspect: 0.6, glyphAspect: 0.85, glyphOpacity: 1,
  tileOpacity: 0.5, gamma: 1.6, fontFamily: 'monospace', density: DENSITY,
  positionX: 0.5, positionY: 0.5,
};
const VERTEX = `attribute vec2 point; varying vec2 uv;
void main() { uv = point * .5 + .5; gl_Position = vec4(point, 0., 1.); }`;
const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D source, atlas;
uniform vec2 grid, size, atlasGrid, cropMin, cropMax;
uniform float glyphCount, gamma, glyphOpacity, tileOpacity, glyphAspect, now;
uniform int glowCount;
uniform vec4 stamps[8];
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
void main() {
  vec2 cell = floor(uv * grid), inside = fract(uv * grid);
  vec2 center = (cell + .5) / grid;
  vec3 color = texture2D(source, mix(cropMin, cropMax, center)).rgb;
  float glow = 0.;
  for (int i = 0; i < 8; i++) {
    if (i < glowCount) {
      float age = clamp(1. - (now - stamps[i].z), 0., 1.);
      float radius = max(1., stamps[i].w);
      float separation = length((stamps[i].xy - stamps[0].xy) * size);
      radius *= max(.15, exp(-.2 * separation / radius));
      float distance = length((center - stamps[i].xy) * size);
      float edge = clamp((distance - .99 * radius) / max(.0001, .01 * radius), 0., 1.);
      glow = min(1., glow + pow(1. - edge, .1) * age);
    }
  }
  float brightness = clamp(pow(luma(color), gamma) + pow(glow, 1.5) * .6, 0., 1.);
  float index = floor(brightness * (glyphCount - 1.) + .5);
  vec2 cellPx = size / grid;
  vec2 extent = vec2(cellPx.y * glyphAspect / cellPx.x, 1.);
  vec2 glyphUV = (inside - (1. - extent) * .5) / extent;
  float mask = step(0., glyphUV.x) * step(glyphUV.x, 1.) * step(0., glyphUV.y) * step(glyphUV.y, 1.);
  vec2 tile = vec2(mod(index, atlasGrid.x), floor(index / atlasGrid.x));
  vec2 padded = vec2(2. / 120.) + clamp(glyphUV, 0., 1.) * (1. - 4. / 120.);
  float alpha = smoothstep(0., 1., texture2D(atlas, (tile + padded) / atlasGrid).r) * mask * glyphOpacity;
  vec3 base = color * tileOpacity;
  vec3 addition = clamp(base + color, 0., 1.);
  addition = clamp(base * (max(.0001, luma(addition)) / max(.0001, luma(base))), 0., 1.);
  vec3 result = mix(base, addition, alpha);
  if (glow > 0.) {
    vec3 illuminated = 1. - (1. - result) * (1. - clamp(result * 2.5, 0., 1.));
    result = mix(result, illuminated, glow);
    float high = max(result.r, max(result.g, result.b));
    float low = min(result.r, min(result.g, result.b));
    float saturation = high > 0. ? (high - low) / high : 0.;
    float boosted = min(1., saturation * (1. + glow));
    if (saturation > .00001) result = vec3(high) - (vec3(high) - result) * (boosted / saturation);
  }
  gl_FragColor = vec4(result, 1.);
}`;

export class AsciiRenderer {
  constructor({ canvas, video, poster, settings = {}, onStatus = () => {} }) {
    this.canvas = canvas;
    this.video = video;
    this.poster = poster;
    this.settings = { ...DEFAULTS, ...settings };
    this.onStatus = onStatus;
    this.stats = { draws: 0, uploads: 0, frameDurations: [], frameIntervals: [], glowCount: 0, visible: true, paused: false, columns: 0, rows: 0 };
    this.stamps = [];
    this.stampData = new Float32Array(32);
    this.listeners = [];
    this.inView = true;
    this.paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stats.paused = this.paused;
    this.lastStamp = -Infinity;
    this.raf = 0;
    this.vfc = 0;
    this.epoch = performance.now();
    this.ready = new Promise(resolve => { this.resolveReady = resolve; });
    try { this.initialize(); } catch (error) { this.fallback(error.message); }
  }

  initialize() {
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) { this.fallback('WebGL is unavailable; showing the source still.'); return; }
    this.gl = gl;
    this.program = gl.createProgram();
    for (const [type, text] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, this.settings.fragmentShader || FRAGMENT]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(reason);
      }
      gl.attachShader(this.program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.uniforms = Object.fromEntries(['source', 'atlas', 'grid', 'size', 'atlasGrid', 'cropMin', 'cropMax', 'glyphCount', 'gamma', 'glyphOpacity', 'tileOpacity', 'glyphAspect', 'now', 'glowCount', 'stamps'].map(name => [name, gl.getUniformLocation(this.program, name === 'stamps' ? 'stamps[0]' : name)]));
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const point = gl.getAttribLocation(this.program, 'point');
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    this.sourceTexture = this.texture(0);
    this.atlasTexture = this.texture(1);
    this.createAtlas();
    gl.uniform1i(this.uniforms.source, 0);
    gl.uniform1i(this.uniforms.atlas, 1);
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.listen(this.video, 'loadeddata', () => this.sourceReady());
    this.listen(this.video, 'seeked', () => { this.needsUpload = true; this.requestDraw(); });
    this.listen(this.video, 'error', () => this.fallback('The video could not load; showing the source still.'));
    this.listen(document, 'visibilitychange', () => this.syncPlayback());
    this.listen(window, 'resize', () => this.resize());
    this.listen(this.canvas, 'webglcontextlost', event => {
      event.preventDefault();
      this.fallback('The graphics context was lost; reload to restore the animation.');
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.inView = entries[0].isIntersecting;
      this.syncPlayback();
    });
    this.intersectionObserver.observe(this.canvas);
    this.canvas.style.touchAction = 'pan-y pinch-zoom';
    this.bindPointer();
    this.resize();
    if (this.video.readyState >= 2) this.sourceReady();
    else if (this.video.error) this.fallback('The video could not load; showing the source still.');
    else this.video.load();
  }

  texture(unit) {
    const gl = this.gl, texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    return texture;
  }

  createAtlas() {
    const { density, fontFamily } = this.settings;
    const columns = Math.ceil(Math.sqrt(density.length)), rows = Math.ceil(density.length / columns);
    const atlas = document.createElement('canvas');
    atlas.width = columns * 50;
    atlas.height = rows * 50;
    const context = atlas.getContext('2d', { alpha: false });
    context.fillStyle = '#000';
    context.fillRect(0, 0, atlas.width, atlas.height);
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `40px ${fontFamily}`;
    for (let i = 0; i < density.length; i++) context.fillText(density[i], (i % columns + .5) * 50, (Math.floor(i / columns) + .5) * 50);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.uniform2f(this.uniforms.atlasGrid, columns, rows);
    gl.uniform1f(this.uniforms.glyphCount, density.length);
  }

  sourceReady() {
    if (this.destroyed || this.failed) return;
    this.loaded = true;
    this.needsUpload = true;
    this.resolveReady(this);
    this.resize();
    this.requestDraw();
    this.syncPlayback();
  }

  resize() {
    if (!this.gl || this.destroyed || this.failed) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2, 5120 / Math.max(rect.width, rect.height));
    const width = Math.max(2, Math.round(rect.width * dpr)), height = Math.max(2, Math.round(rect.height * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.columns = Math.max(10, Math.min(256, Math.floor(rect.width / Math.max(5, Math.min(30, this.settings.cellSize)))));
    this.rows = Math.max(5, Math.floor(height / (width / this.columns / this.settings.cellAspect)));
    this.stats.columns = this.columns;
    this.stats.rows = this.rows;
    const gl = this.gl, u = this.uniforms;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(u.grid, this.columns, this.rows);
    gl.uniform2f(u.size, width, height);
    const sourceAspect = (this.video.videoWidth || width) / (this.video.videoHeight || height);
    const panelAspect = width / height;
    const spanX = Math.min(1, panelAspect / sourceAspect), spanY = Math.min(1, sourceAspect / panelAspect);
    const startX = (1 - spanX) * this.settings.positionX, startY = (1 - spanY) * (1 - this.settings.positionY);
    gl.uniform2f(u.cropMin, startX, startY);
    gl.uniform2f(u.cropMax, startX + spanX, startY + spanY);
    for (const name of ['gamma', 'glyphOpacity', 'tileOpacity', 'glyphAspect']) gl.uniform1f(u[name], this.settings[name]);
    this.requestDraw();
  }

  get active() { return !this.destroyed && !this.failed && this.inView && !document.hidden; }

  syncPlayback() {
    const attempt = this.playAttempt = (this.playAttempt || 0) + 1;
    this.stats.visible = this.active;
    if (!this.active) {
      this.video.pause();
      this.stopFrames();
      this.stamps.length = 0;
      this.stats.glowCount = 0;
      this.clearTouch();
      return;
    }
    if (this.paused) {
      this.video.pause();
      this.cancelVideoFrame();
    } else if (this.loaded) {
      this.video.play().then(() => {
        if (attempt !== this.playAttempt || this.destroyed || this.failed) return;
        if (!this.active || this.paused) this.video.pause();
        else this.scheduleVideo();
      }).catch(() => {
        if (attempt !== this.playAttempt || !this.active || this.paused) return;
        this.paused = true;
        this.stats.paused = true;
        this.onStatus({ state: 'ready', message: 'Playback is paused. Use Play to start.' });
      });
    }
    this.lastDraw = 0;
    this.requestDraw();
  }

  scheduleVideo() {
    if (!this.active || this.paused || this.vfc) return;
    if (this.video.requestVideoFrameCallback) {
      this.vfc = this.video.requestVideoFrameCallback(() => {
        this.vfc = 0;
        if (!this.active || this.paused) return;
        this.needsUpload = true;
        this.requestDraw();
        this.scheduleVideo();
      });
    } else this.requestDraw();
  }

  requestDraw() {
    if (!this.active || !this.loaded || this.raf) return;
    this.raf = requestAnimationFrame(time => { this.raf = 0; this.draw(time); });
  }

  draw(time) {
    if (!this.active || !this.loaded) return;
    const start = performance.now(), seconds = (time - this.epoch) / 1000;
    while (this.stamps.length && seconds - this.stamps.at(-1).time >= 1) this.stamps.pop();
    this.stats.glowCount = this.stamps.length;
    const gl = this.gl;
    try {
      if (this.needsUpload || (!this.video.requestVideoFrameCallback && this.lastMediaTime !== this.video.currentTime)) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
        this.stats.uploads++;
        this.lastMediaTime = this.video.currentTime;
        this.needsUpload = false;
      }
      this.stampData.fill(0);
      this.stamps.forEach((stamp, i) => this.stampData.set([stamp.x, stamp.y, stamp.time, stamp.radius], i * 4));
      gl.uniform4fv(this.uniforms.stamps, this.stampData);
      gl.uniform1i(this.uniforms.glowCount, this.stamps.length);
      gl.uniform1f(this.uniforms.now, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.stats.draws++;
      this.sample('frameDurations', performance.now() - start);
      if (this.lastDraw) this.sample('frameIntervals', time - this.lastDraw);
      this.lastDraw = time;
      if (!this.reportedReady) {
        this.reportedReady = true;
        this.onStatus({ state: 'ready', message: this.paused ? 'Paused' : 'Playing' });
        this.resolveReady(this);
      }
    } catch (error) { this.fallback(error.message); return; }
    if (this.stamps.length || (!this.video.requestVideoFrameCallback && !this.paused)) this.requestDraw();
  }

  sample(key, value) {
    const samples = this.stats[key];
    if (samples.length >= 600) samples.shift();
    samples.push(value);
  }

  stamp(clientX, clientY) {
    const now = performance.now();
    if (!this.active || now - this.lastStamp < 25) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.lastStamp = now;
    this.stamps.unshift({ x: (clientX - rect.left) / rect.width, y: 1 - (clientY - rect.top) / rect.height, time: (now - this.epoch) / 1000, radius: this.canvas.width / this.columns * 8 });
    this.stamps.length = Math.min(8, this.stamps.length);
    this.requestDraw();
  }

  bindPointer() {
    this.listen(this.canvas, 'pointermove', event => {
      if (event.pointerType !== 'touch') { this.stamp(event.clientX, event.clientY); return; }
      if (!this.touch || this.touch.id !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - this.touch.startX, event.clientY - this.touch.startY) > 8;
      this.touch.x = event.clientX;
      this.touch.y = event.clientY;
      if (moved && !this.touch.drawing) { this.touch.moved = true; clearTimeout(this.touchTimer); }
      if (this.touch.drawing) this.stamp(event.clientX, event.clientY);
    });
    this.listen(this.canvas, 'pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      this.clearTouch();
      this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, drawing: false };
      this.touchTimer = setTimeout(() => {
        if (!this.touch || this.touch.moved) return;
        this.touch.drawing = true;
        this.stamp(this.touch.x, this.touch.y);
        this.touchInterval = setInterval(() => { if (this.touch) this.stamp(this.touch.x, this.touch.y); }, 40);
      }, 320);
    });
    this.listen(window, 'pointerup', event => {
      if (this.touch?.id !== event.pointerId) return;
      if (!this.touch.moved) this.stamp(event.clientX, event.clientY);
      this.clearTouch();
    });
    this.listen(window, 'pointercancel', () => this.clearTouch());
  }

  clearTouch() { clearTimeout(this.touchTimer); clearInterval(this.touchInterval); this.touch = null; }
  listen(target, event, callback) { target.addEventListener(event, callback, { passive: event !== 'webglcontextlost' }); this.listeners.push([target, event, callback]); }
  cancelVideoFrame() { if (this.vfc) this.video.cancelVideoFrameCallback?.(this.vfc); this.vfc = 0; }
  stopFrames() { cancelAnimationFrame(this.raf); this.raf = 0; this.cancelVideoFrame(); }

  setSettings(patch) {
    if (this.destroyed || this.failed) return;
    this.settings = { ...this.settings, ...patch };
    if (patch.fontFamily || patch.density) this.createAtlas();
    this.resize();
  }

  setPaused(paused) { this.paused = Boolean(paused); this.stats.paused = this.paused; this.syncPlayback(); }
  restart() { return this.seek(0); }
  seek(seconds) {
    if (this.destroyed || this.failed) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { this.video.removeEventListener('seeked', finish); resolve(); };
      const target = Math.max(0, Math.min(Number.isFinite(this.video.duration) ? this.video.duration : seconds, seconds));
      if (Math.abs(this.video.currentTime - target) < .001) { this.needsUpload = true; this.requestDraw(); resolve(); return; }
      this.video.addEventListener('seeked', finish, { once: true });
      this.video.currentTime = target;
    });
  }

  fallback(message) {
    if (this.destroyed || this.failed) return;
    this.failed = true;
    this.video.pause();
    this.stopFrames();
    this.clearTouch();
    this.onStatus({ state: 'fallback', message });
    this.resolveReady(this);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopFrames();
    this.clearTouch();
    this.video.pause();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    for (const [target, event, callback] of this.listeners) target.removeEventListener(event, callback);
    const gl = this.gl;
    if (gl) {
      gl.deleteTexture(this.sourceTexture);
      gl.deleteTexture(this.atlasTexture);
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
    }
    this.resolveReady(this);
  }
}
