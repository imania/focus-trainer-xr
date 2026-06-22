const canvas = document.getElementById("xrCanvas");
const gl = canvas.getContext("webgl", { xrCompatible: true, antialias: true });
const launchParams = new URLSearchParams(window.location.search);

const state = {
  eyeMode: "left",
  leftProfile: "balanced",
  rightProfile: "balanced",
  pattern: "steppedRandom",
  difficulty: "normal",
  nearDistance: 0.8,
  farDistance: 5,
  stepInterval: 3,
  currentDistance: 0.8,
  duration: 180,
  remaining: 180,
  motionElapsed: 0,
  randomSeed: 1701,
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
  activeProfileLabel: document.getElementById("activeProfileLabel"),
  activeDistanceLabel: document.getElementById("activeDistanceLabel"),
  repCount: document.getElementById("repCount"),
  phaseLabel: document.getElementById("phaseLabel"),
  instructionLabel: document.getElementById("instructionLabel"),
  leftProfileSelect: document.getElementById("leftProfileSelect"),
  rightProfileSelect: document.getElementById("rightProfileSelect"),
  patternSelect: document.getElementById("patternSelect"),
  difficultySelect: document.getElementById("difficultySelect"),
  nearDistanceInput: document.getElementById("nearDistanceInput"),
  farDistanceInput: document.getElementById("farDistanceInput"),
  nearDistanceOutput: document.getElementById("nearDistanceOutput"),
  farDistanceOutput: document.getElementById("farDistanceOutput"),
  distanceRangeOutput: document.getElementById("distanceRangeOutput"),
  stepIntervalInput: document.getElementById("stepIntervalInput"),
  stepIntervalOutput: document.getElementById("stepIntervalOutput"),
};

const vertexSource = `
attribute vec3 position;
uniform mat4 modelViewProjection;
uniform float pointScale;
void main() {
  gl_Position = modelViewProjection * vec4(position, 1.0);
  gl_PointSize = pointScale;
}`;

const sphereVertexSource = `
attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewProjection;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal = normalize(normal);
  vPosition = position;
  gl_Position = modelViewProjection * vec4(position, 1.0);
}`;

const sphereFragmentSource = `
precision mediump float;
uniform vec3 color;
uniform float dim;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vec3 lightDir = normalize(vec3(-0.35, 0.65, 0.7));
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
  float rim = pow(1.0 - max(vNormal.z, 0.0), 2.0);
  float highlight = pow(max(dot(normalize(vNormal), normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 18.0);
  vec3 shaded = color * (0.42 + diffuse * 0.58) + vec3(0.6, 1.0, 0.88) * highlight * 0.45;
  shaded += vec3(0.18, 0.55, 0.47) * rim * 0.28;
  gl_FragColor = vec4(shaded * dim, dim);
}`;

const lineFragmentSource = `
precision mediump float;
uniform vec3 color;
uniform float dim;
void main() {
  gl_FragColor = vec4(color * dim, 0.42);
}`;

const sphereProgram = createProgram(sphereVertexSource, sphereFragmentSource);
const lineProgram = createProgram(vertexSource, lineFragmentSource);
const guideBuffer = gl.createBuffer();
const backgroundBuffer = gl.createBuffer();
const spherePositionBuffer = gl.createBuffer();
const sphereNormalBuffer = gl.createBuffer();
let backgroundCacheKey = "";
let backgroundVertexCount = 0;
let sphereVertexCount = 0;

const guideVertices = [];
for (let i = 0; i <= 96; i += 1) {
  const a = (Math.PI * 2 * i) / 96;
  guideVertices.push(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0);
}
gl.bindBuffer(gl.ARRAY_BUFFER, guideBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(guideVertices), gl.STATIC_DRAW);
buildSphereMesh();

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
  const timeSeconds = getMotionTime(performance.now() / 1000);
  els.durationOutput.textContent = formatTime(state.duration);
  els.timeRemaining.textContent = formatTime(state.remaining);
  els.repCount.textContent = String(state.reps);
  els.activeEyeLabel.textContent = getActiveEyeLabel(timeSeconds);
  els.activeProfileLabel.textContent = getProfileLabel(getRenderProfile(timeSeconds));
  els.activeDistanceLabel.textContent = formatMeters(state.currentDistance);
  els.phaseLabel.textContent = state.running && !state.paused ? "운동 중" : state.paused ? "일시정지" : "대기";
  els.instructionLabel.textContent = getInstructionText(getRenderProfile(timeSeconds));
  els.nearDistanceOutput.textContent = formatMeters(state.nearDistance);
  els.farDistanceOutput.textContent = formatMeters(state.farDistance);
  els.distanceRangeOutput.textContent = `${formatMeters(state.nearDistance)} - ${formatMeters(state.farDistance)}`;
  els.stepIntervalOutput.textContent = `${state.stepInterval.toFixed(1)}초`;
}

function getMotionTime(timeSeconds) {
  return state.running || state.paused ? state.motionElapsed : timeSeconds * 0.35;
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

function formatMeters(value) {
  return `${value.toFixed(1)}m`;
}

function getProfileForEye(eye) {
  if (eye === "left") return state.leftProfile;
  if (eye === "right") return state.rightProfile;
  if (state.leftProfile === state.rightProfile) return state.leftProfile;
  return "balanced";
}

function getRenderProfile(timeSeconds) {
  const activeEye = getActiveEye(timeSeconds);
  return getProfileForEye(activeEye);
}

function getProfileLabel(profile) {
  if (profile === "myopia") return "근시/원거리";
  if (profile === "hyperopia") return "원시/근거리";
  return "균형";
}

function getInstructionText(profile) {
  if (state.pattern === "steppedRandom") {
    return `${state.stepInterval.toFixed(1)}초마다 거리 단계를 바꾸고 위치는 무작위로 배치합니다`;
  }
  if (profile === "myopia") return "원거리 체류를 길게 두고 편안한 이완감을 확인하세요";
  if (profile === "hyperopia") return "근거리 체류를 길게 두되 흐림이나 통증이 생기면 중단하세요";
  return "머리를 편하게 두고 타겟을 부드럽게 따라가세요";
}

function getDepthProgress(baseProgress, profile) {
  if (profile === "myopia") return Math.pow(baseProgress, 0.55);
  if (profile === "hyperopia") return Math.pow(baseProgress, 1.85);
  return baseProgress;
}

function getTrackingDepth(profile) {
  const range = state.farDistance - state.nearDistance;
  if (profile === "myopia") return state.nearDistance + range * 0.78;
  if (profile === "hyperopia") return state.nearDistance + range * 0.22;
  return state.nearDistance + range * 0.5;
}

function seededRandom(seed) {
  const value = Math.sin((seed + state.randomSeed) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function getSteppedRandomPosition(stepIndex, profile) {
  const sequence = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25];
  const sequenceIndex = ((stepIndex % sequence.length) + sequence.length) % sequence.length;
  const depthProgress = getDepthProgress(sequence[sequenceIndex], profile);
  const depth = state.nearDistance + depthProgress * (state.farDistance - state.nearDistance);
  const maxX = Math.min(1.55, Math.max(0.12, depth * 0.22));
  const maxY = Math.min(0.9, Math.max(0.08, depth * 0.14));
  const x = (seededRandom(stepIndex * 2 + 11) - 0.5) * maxX * 2;
  const y = (seededRandom(stepIndex * 2 + 12) - 0.5) * maxY * 2;
  return [x, y, -depth];
}

function getSteppedTargetPosition(timeSeconds, profile) {
  const interval = Math.max(1, state.stepInterval);
  const stepIndex = Math.floor(timeSeconds / interval);
  const localProgress = (timeSeconds % interval) / interval;
  if (stepIndex !== state.repPhase) {
    state.repPhase = stepIndex;
    if (state.running && !state.paused) state.reps += 1;
  }

  const current = getSteppedRandomPosition(stepIndex, profile);
  const previous = getSteppedRandomPosition(stepIndex - 1, profile);
  const transitionPortion = Math.min(0.42, 0.8 / interval);
  if (localProgress > transitionPortion) return current;

  const amount = smoothstep(localProgress / transitionPortion);
  return [
    lerp(previous[0], current[0], amount),
    lerp(previous[1], current[1], amount),
    lerp(previous[2], current[2], amount),
  ];
}

function getTargetPosition(timeSeconds) {
  const speed = getSpeed();
  const t = timeSeconds * speed;
  const wave = Math.sin(t * Math.PI * 2);
  const baseProgress = (wave + 1) / 2;
  const profile = getRenderProfile(timeSeconds);
  if (state.pattern === "steppedRandom") return getSteppedTargetPosition(timeSeconds, profile);

  const cycle = Math.floor(t);
  if (cycle !== state.repPhase) {
    state.repPhase = cycle;
    if (state.running && !state.paused) state.reps += 1;
  }

  const trackingDepth = getTrackingDepth(profile);
  const horizontalRange = Math.min(1.8, Math.max(0.6, trackingDepth * 0.34));
  const verticalRange = Math.min(1.15, Math.max(0.35, trackingDepth * 0.22));

  if (state.pattern === "horizontal") return [wave * horizontalRange, 0, -trackingDepth];
  if (state.pattern === "vertical") return [0, wave * verticalRange, -trackingDepth];
  if (state.pattern === "circle") {
    return [
      Math.cos(t * Math.PI * 2) * horizontalRange * 0.78,
      Math.sin(t * Math.PI * 2) * verticalRange * 0.78,
      -trackingDepth,
    ];
  }

  const depthProgress = getDepthProgress(baseProgress, profile);
  const depth = state.nearDistance + depthProgress * (state.farDistance - state.nearDistance);
  return [0, 0, -depth];
}

function startSession() {
  state.running = true;
  state.paused = false;
  state.remaining = state.duration;
  state.motionElapsed = 0;
  state.randomSeed = Math.floor(Math.random() * 100000);
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
  state.motionElapsed = 0;
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

function scaleMatrix(x, y, z) {
  const out = identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

function modelMatrix(x, y, z, scale) {
  return multiply(translateMatrix(x, y, z), scaleMatrix(scale, scale, scale));
}

function getTargetRadius(distance) {
  const depthFactor = Math.max(0, Math.min(1, (distance - state.nearDistance) / Math.max(0.1, state.farDistance - state.nearDistance)));
  return 0.065 + depthFactor * 0.035;
}

function buildSphereMesh() {
  const latSegments = 14;
  const lonSegments = 24;
  const positions = [];
  const normals = [];

  for (let lat = 0; lat < latSegments; lat += 1) {
    const theta1 = (lat / latSegments) * Math.PI;
    const theta2 = ((lat + 1) / latSegments) * Math.PI;
    for (let lon = 0; lon < lonSegments; lon += 1) {
      const phi1 = (lon / lonSegments) * Math.PI * 2;
      const phi2 = ((lon + 1) / lonSegments) * Math.PI * 2;
      const p1 = spherePoint(theta1, phi1);
      const p2 = spherePoint(theta2, phi1);
      const p3 = spherePoint(theta2, phi2);
      const p4 = spherePoint(theta1, phi2);
      pushSphereTriangle(positions, normals, p1, p2, p3);
      pushSphereTriangle(positions, normals, p1, p3, p4);
    }
  }

  sphereVertexCount = positions.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, spherePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereNormalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
}

function spherePoint(theta, phi) {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi),
  ];
}

function pushSphereTriangle(positions, normals, ...points) {
  points.forEach((point) => {
    positions.push(point[0], point[1], point[2]);
    normals.push(point[0], point[1], point[2]);
  });
}

function addLine(vertices, a, b) {
  vertices.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

function addDepthFrame(vertices, depth) {
  const width = Math.min(3.8, Math.max(0.38, depth * 0.5));
  const height = Math.min(2.2, Math.max(0.24, depth * 0.3));
  const z = -depth;
  const left = -width / 2;
  const right = width / 2;
  const top = height / 2;
  const bottom = -height / 2;
  addLine(vertices, [left, bottom, z], [right, bottom, z]);
  addLine(vertices, [right, bottom, z], [right, top, z]);
  addLine(vertices, [right, top, z], [left, top, z]);
  addLine(vertices, [left, top, z], [left, bottom, z]);
}

function updateBackgroundBuffer() {
  const key = `${state.nearDistance.toFixed(1)}:${state.farDistance.toFixed(1)}`;
  if (key === backgroundCacheKey) return;

  const vertices = [];
  const floorY = -1.12;
  const gridFar = Math.max(8, state.farDistance);
  for (let z = 0.5; z <= gridFar + 0.01; z += 0.5) {
    addLine(vertices, [-3.2, floorY, -z], [3.2, floorY, -z]);
  }
  for (let x = -3; x <= 3.01; x += 0.5) {
    addLine(vertices, [x, floorY, -0.4], [x, floorY, -gridFar]);
  }

  const range = state.farDistance - state.nearDistance;
  for (let i = 0; i <= 4; i += 1) {
    addDepthFrame(vertices, state.nearDistance + range * (i / 4));
  }
  addLine(vertices, [0, -0.85, -state.nearDistance], [0, -0.85, -state.farDistance]);

  backgroundCacheKey = key;
  backgroundVertexCount = vertices.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
}

function renderScene(projectionMatrix, viewMatrix, viewport, eyeName, timeSeconds) {
  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
  gl.enable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.035, 0.039, 0.051, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const motionSeconds = getMotionTime(timeSeconds);
  const activeEye = getActiveEye(motionSeconds);
  const eyeDim =
    state.eyeMode === "both" ||
    activeEye === eyeName ||
    eyeName === "mono"
      ? 1
      : 0.18;

  const sceneMvp = multiply(projectionMatrix, viewMatrix);
  drawBackground(sceneMvp, eyeDim);

  const [x, y, z] = getTargetPosition(motionSeconds);
  state.currentDistance = Math.abs(z);
  const targetRadius = getTargetRadius(state.currentDistance);
  const model = modelMatrix(x, y, z, targetRadius);
  const mvp = multiply(sceneMvp, model);
  drawGuide(mvp, eyeDim);
  drawTarget(mvp, eyeDim);
}

function drawBackground(mvp, dim) {
  updateBackgroundBuffer();
  gl.useProgram(lineProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
  const position = gl.getAttribLocation(lineProgram, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, "modelViewProjection"), false, new Float32Array(mvp));
  gl.uniform1f(gl.getUniformLocation(lineProgram, "pointScale"), 1);
  gl.uniform3f(gl.getUniformLocation(lineProgram, "color"), 0.28, 0.38, 0.48);
  gl.uniform1f(gl.getUniformLocation(lineProgram, "dim"), dim * 0.7);
  gl.drawArrays(gl.LINES, 0, backgroundVertexCount);
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
  gl.useProgram(sphereProgram);
  const position = gl.getAttribLocation(sphereProgram, "position");
  gl.enableVertexAttribArray(position);
  gl.bindBuffer(gl.ARRAY_BUFFER, spherePositionBuffer);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

  const normal = gl.getAttribLocation(sphereProgram, "normal");
  gl.enableVertexAttribArray(normal);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereNormalBuffer);
  gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 0, 0);

  gl.uniformMatrix4fv(gl.getUniformLocation(sphereProgram, "modelViewProjection"), false, new Float32Array(mvp));
  gl.uniform3f(gl.getUniformLocation(sphereProgram, "color"), 0.27, 0.86, 0.72);
  gl.uniform1f(gl.getUniformLocation(sphereProgram, "dim"), dim);
  gl.drawArrays(gl.TRIANGLES, 0, sphereVertexCount);
}

function tickTimer(timestamp) {
  if (state.running && !state.paused) {
    if (state.lastTimestamp) {
      const delta = (timestamp - state.lastTimestamp) / 1000;
      state.remaining -= delta;
      state.motionElapsed += delta;
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
    return false;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-vr");
  els.xrStatus.textContent = supported ? "Quest VR 가능" : "VR 미지원";
  els.xrButton.disabled = !supported;
  return supported;
}

async function enterXr() {
  if (!navigator.xr || state.xrSession) return;
  let session;
  try {
    session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor"],
    });
  } catch (error) {
    els.xrStatus.textContent = "VR 진입 실패";
    throw error;
  }
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

function shouldAutoEnterImmersive() {
  return (
    launchParams.get("autoEnter") === "1" ||
    launchParams.get("pwa") === "immersive" ||
    window.getDigitalGoodsService !== undefined
  );
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

async function initializeApp() {
  registerServiceWorker();
  updateUi();
  requestAnimationFrame(drawPreview);

  const supported = await setupXr();
  if (supported && shouldAutoEnterImmersive()) {
    els.xrStatus.textContent = "PWA VR 진입 중";
    try {
      await enterXr();
      if (!state.running) startSession();
    } catch (error) {
      console.warn("PWA immersive launch failed", error);
    }
  }
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
  state.repPhase = -1;
  state.reps = 0;
  updateUi();
});

els.difficultySelect.addEventListener("change", () => {
  state.difficulty = els.difficultySelect.value;
});

els.leftProfileSelect.addEventListener("change", () => {
  state.leftProfile = els.leftProfileSelect.value;
  updateUi();
});

els.rightProfileSelect.addEventListener("change", () => {
  state.rightProfile = els.rightProfileSelect.value;
  updateUi();
});

els.nearDistanceInput.addEventListener("input", () => {
  state.nearDistance = Number(els.nearDistanceInput.value);
  if (state.nearDistance > state.farDistance - 0.4) {
    state.farDistance = Math.min(8, state.nearDistance + 0.4);
    els.farDistanceInput.value = String(state.farDistance);
  }
  updateUi();
});

els.farDistanceInput.addEventListener("input", () => {
  state.farDistance = Number(els.farDistanceInput.value);
  if (state.farDistance < state.nearDistance + 0.4) {
    state.nearDistance = Math.max(0.4, state.farDistance - 0.4);
    els.nearDistanceInput.value = String(state.nearDistance);
  }
  updateUi();
});

els.stepIntervalInput.addEventListener("input", () => {
  state.stepInterval = Number(els.stepIntervalInput.value);
  state.repPhase = -1;
  updateUi();
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

initializeApp();
