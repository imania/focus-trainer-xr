const canvas = document.getElementById("xrCanvas");
const gl = canvas.getContext("webgl", { xrCompatible: true, antialias: true });

const state = {
  eyeMode: "left",
  pattern: "depth",
  difficulty: "normal",
  duration: 180,
  remaining: 180,
  running: false,
  paused: false,
  reps: 0,
  lastTimestamp: 0,
  repPhase: 0,
  xrSession: null,
  xrRefSpace: null,
  xrBaseLayer: null,
};

const els = {
  xrStatus: document.getElementById("xrStatus"),
  xrButton: document.getElementById("xrButton"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  durationInput: document.getElementById("durationInput"),
  durationOutput: document.getElementById("durationOutput"),
  timeRemaining: document.getElementById("timeRemaining"),
  activeEyeLabel: document.getElementById("activeEyeLabel"),
  repCount: document.getElementById("repCount"),
  phaseLabel: document.getElementById("phaseLabel"),
  patternSelect: document.getElementById("patternSelect"),
  difficultySelect: document.getElementById("difficultySelect"),
};

const vertexSource = `
attribute vec3 position;
uniform mat4 modelViewProjection;
uniform float pointScale;
void main() {
  gl_Position = modelViewProjection * vec4(position, 1.0);
  gl_PointSize = pointScale;
}`;

const fragmentSource = `
precision mediump float;
uniform vec3 color;
uniform float dim;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float glow = smoothstep(0.5, 0.0, dist);
  gl_FragColor = vec4(color * dim, glow);
}`;

const lineFragmentSource = `
precision mediump float;
uniform vec3 color;
uniform float dim;
void main() {
  gl_FragColor = vec4(color * dim, 0.42);
}`;

const program = createProgram(vertexSource, fragmentSource);
const lineProgram = createProgram(vertexSource, lineFragmentSource);
const targetBuffer = gl.createBuffer();
const guideBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, -2]), gl.DYNAMIC_DRAW);

const guideVertices = [];
for (let i = 0; i <= 96; i += 1) {
  const a = (Math.PI * 2 * i) / 96;
  guideVertices.push(Math.cos(a) * 0.35, Math.sin(a) * 0.35, -2.2);
}
gl.bindBuffer(gl.ARRAY_BUFFER, guideBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(guideVertices), gl.STATIC_DRAW);

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }
  return shader;
}

function createProgram(vs, fs) {
  const compiled = gl.createProgram();
  gl.attachShader(compiled, createShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(compiled, createShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(compiled);
  if (!gl.getProgramParameter(compiled, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(compiled) || "Program link failed");
  }
  return compiled;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(safeSeconds / 60);
  const sec = String(safeSeconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function updateUi() {
  els.durationOutput.textContent = formatTime(state.duration);
  els.timeRemaining.textContent = formatTime(state.remaining);
  els.repCount.textContent = String(state.reps);
  els.activeEyeLabel.textContent = getActiveEyeLabel(performance.now() / 1000);
  els.phaseLabel.textContent = state.running && !state.paused ? "운동 중" : state.paused ? "일시정지" : "대기";
}

function getSpeed() {
  if (state.difficulty === "calm") return 0.22;
  if (state.difficulty === "easy") return 0.32;
  return 0.42;
}

function getActiveEye(timeSeconds) {
  if (state.eyeMode !== "alternate") return state.eyeMode;
  return Math.floor(timeSeconds / 12) % 2 === 0 ? "left" : "right";
}

function getActiveEyeLabel(timeSeconds) {
  const mode = getActiveEye(timeSeconds);
  if (state.eyeMode === "both") return "양쪽";
  return mode === "left" ? "왼쪽" : "오른쪽";
}

function getTargetPosition(timeSeconds) {
  const speed = getSpeed();
  const t = timeSeconds * speed;
  const wave = Math.sin(t * Math.PI * 2);
  const cycle = Math.floor(t);
  if (cycle !== state.repPhase) {
    state.repPhase = cycle;
    if (state.running && !state.paused) state.reps += 1;
  }

  if (state.pattern === "horizontal") return [wave * 0.75, 0, -2.2];
  if (state.pattern === "vertical") return [0, wave * 0.45, -2.2];
  if (state.pattern === "circle") {
    return [Math.cos(t * Math.PI * 2) * 0.55, Math.sin(t * Math.PI * 2) * 0.35, -2.2];
  }

  const depth = 1.05 + ((wave + 1) / 2) * 2.45;
  return [0, 0, -depth];
}

function startSession() {
  state.running = true;
  state.paused = false;
  state.remaining = state.duration;
  state.reps = 0;
  state.repPhase = 0;
  state.lastTimestamp = 0;
  updateUi();
}

function pauseSession() {
  if (!state.running) return;
  state.paused = !state.paused;
  updateUi();
}

function resetSession() {
  state.running = false;
  state.paused = false;
  state.remaining = state.duration;
  state.reps = 0;
  updateUi();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let i = 0; i < 4; i += 1) {
        out[col * 4 + row] += a[i * 4 + row] * b[col * 4 + i];
      }
    }
  }
  return out;
}

function translateMatrix(x, y, z) {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

function renderScene(projectionMatrix, viewMatrix, viewport, eyeName, timeSeconds) {
  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.035, 0.039, 0.051, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const activeEye = getActiveEye(timeSeconds);
  const eyeDim =
    state.eyeMode === "both" ||
    activeEye === eyeName ||
    eyeName === "mono"
      ? 1
      : 0.18;

  const guideMvp = multiply(projectionMatrix, viewMatrix);
  drawGuide(guideMvp, eyeDim);

  const [x, y, z] = getTargetPosition(timeSeconds);
  const model = translateMatrix(x, y, z + 2);
  const mvp = multiply(multiply(projectionMatrix, viewMatrix), model);
  drawTarget(mvp, eyeDim);
}

function drawGuide(mvp, dim) {
  gl.useProgram(lineProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, guideBuffer);
  const position = gl.getAttribLocation(lineProgram, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, "modelViewProjection"), false, new Float32Array(mvp));
  gl.uniform1f(gl.getUniformLocation(lineProgram, "pointScale"), 1);
  gl.uniform3f(gl.getUniformLocation(lineProgram, "color"), 0.38, 0.49, 0.58);
  gl.uniform1f(gl.getUniformLocation(lineProgram, "dim"), dim);
  gl.drawArrays(gl.LINE_STRIP, 0, guideVertices.length / 3);
}

function drawTarget(mvp, dim) {
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewProjection"), false, new Float32Array(mvp));
  gl.uniform1f(gl.getUniformLocation(program, "pointScale"), 54);
  gl.uniform3f(gl.getUniformLocation(program, "color"), 0.27, 0.86, 0.72);
  gl.uniform1f(gl.getUniformLocation(program, "dim"), dim);
  gl.drawArrays(gl.POINTS, 0, 1);
}

function tickTimer(timestamp) {
  if (state.running && !state.paused) {
    if (state.lastTimestamp) {
      const delta = (timestamp - state.lastTimestamp) / 1000;
      state.remaining -= delta;
      if (state.remaining <= 0) {
        state.remaining = 0;
        state.running = false;
      }
    }
    state.lastTimestamp = timestamp;
  } else {
    state.lastTimestamp = timestamp;
  }
}

function drawPreview(timestamp) {
  if (!state.xrSession) {
    resizeCanvas();
    tickTimer(timestamp);
    const aspect = canvas.width / canvas.height;
    const projection = perspective(Math.PI / 3, aspect, 0.05, 20);
    renderScene(projection, identity(), { x: 0, y: 0, width: canvas.width, height: canvas.height }, "mono", timestamp / 1000);
    updateUi();
    requestAnimationFrame(drawPreview);
  }
}

async function setupXr() {
  if (!("xr" in navigator)) {
    els.xrStatus.textContent = "WebXR 미지원";
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-vr");
  els.xrStatus.textContent = supported ? "Quest VR 가능" : "VR 미지원";
  els.xrButton.disabled = !supported;
}

async function enterXr() {
  if (!navigator.xr || state.xrSession) return;
  const session = await navigator.xr.requestSession("immersive-vr", {
    optionalFeatures: ["local-floor", "bounded-floor"],
  });
  state.xrSession = session;
  state.xrBaseLayer = new XRWebGLLayer(session, gl);
  session.updateRenderState({ baseLayer: state.xrBaseLayer });
  state.xrRefSpace = await session.requestReferenceSpace("local");
  session.addEventListener("end", () => {
    state.xrSession = null;
    requestAnimationFrame(drawPreview);
  });
  session.requestAnimationFrame(onXrFrame);
}

function onXrFrame(timestamp, frame) {
  const session = frame.session;
  tickTimer(timestamp);
  const pose = frame.getViewerPose(state.xrRefSpace);
  if (pose) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.xrBaseLayer.framebuffer);
    for (const view of pose.views) {
      const viewport = state.xrBaseLayer.getViewport(view);
      renderScene(view.projectionMatrix, view.transform.inverse.matrix, viewport, view.eye, timestamp / 1000);
    }
  }
  updateUi();
  session.requestAnimationFrame(onXrFrame);
}

document.querySelectorAll("[data-eye-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-eye-mode]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.eyeMode = button.dataset.eyeMode;
    updateUi();
  });
});

els.patternSelect.addEventListener("change", () => {
  state.pattern = els.patternSelect.value;
});

els.difficultySelect.addEventListener("change", () => {
  state.difficulty = els.difficultySelect.value;
});

els.durationInput.addEventListener("input", () => {
  state.duration = Number(els.durationInput.value);
  if (!state.running) state.remaining = state.duration;
  updateUi();
});

els.startButton.addEventListener("click", startSession);
els.pauseButton.addEventListener("click", pauseSession);
els.resetButton.addEventListener("click", resetSession);
els.xrButton.addEventListener("click", enterXr);

window.addEventListener("resize", resizeCanvas);

setupXr();
updateUi();
requestAnimationFrame(drawPreview);
