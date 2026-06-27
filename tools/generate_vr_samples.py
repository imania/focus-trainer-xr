import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
VIDEO_AV = ROOT / ".video_av"
if VIDEO_AV.exists():
    sys.path.insert(0, str(VIDEO_AV))

try:
    import av
except ImportError as exc:
    raise SystemExit("Install PyAV into .video_av before running this script.") from exc


DEFAULT_FPS = 12
DEFAULT_DURATION_SECONDS = 180
STEP_SECONDS = 3.0
TRANSITION_SECONDS = 0.8
DEFAULT_EYE_WIDTH = 640
DEFAULT_HEIGHT = 360
FOV_DEGREES = 64
IPD_METERS = 0.064
FLOOR_Y = -1.15

RENDER = {
    "fps": DEFAULT_FPS,
    "duration": DEFAULT_DURATION_SECONDS,
    "eye_width": DEFAULT_EYE_WIDTH,
    "height": DEFAULT_HEIGHT,
    "width": DEFAULT_EYE_WIDTH * 2,
}


SAMPLES = [
    {
        "name": "right_hyperopia_0p4_5m_sbs3d",
        "active_eye": "right",
        "profile": "hyperopia",
        "near": 0.4,
        "far": 5.0,
        "seed": 1201,
    },
    {
        "name": "left_hyperopia_0p4_5m_sbs3d",
        "active_eye": "left",
        "profile": "hyperopia",
        "near": 0.4,
        "far": 5.0,
        "seed": 1202,
    },
    {
        "name": "right_myopia_0p6_8m_sbs3d",
        "active_eye": "right",
        "profile": "myopia",
        "near": 0.6,
        "far": 8.0,
        "seed": 2201,
    },
    {
        "name": "left_myopia_0p6_8m_sbs3d",
        "active_eye": "left",
        "profile": "myopia",
        "near": 0.6,
        "far": 8.0,
        "seed": 2202,
    },
]


def depth_progress(value, profile):
    if profile == "myopia":
        return value**0.55
    if profile == "hyperopia":
        return value**1.85
    return value


def smoothstep(value):
    clamped = max(0.0, min(1.0, value))
    return clamped * clamped * (3.0 - 2.0 * clamped)


def lerp(a, b, amount):
    return a + (b - a) * amount


def seeded_random(seed):
    value = math.sin(seed * 12.9898) * 43758.5453
    return value - math.floor(value)


def point_for_step(step_index, sample):
    sequence = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]
    sequence_index = step_index % len(sequence)
    progress = depth_progress(sequence[sequence_index], sample["profile"])
    depth = sample["near"] + progress * (sample["far"] - sample["near"])

    max_x = min(1.55, max(0.12, depth * 0.22))
    max_y = min(0.9, max(0.08, depth * 0.14))
    seed_base = sample["seed"] + step_index * 31
    x = (seeded_random(seed_base + 11) - 0.5) * max_x * 2
    y = (seeded_random(seed_base + 12) - 0.5) * max_y * 2
    return (x, y, -depth)


def target_for_time(time_seconds, sample):
    step_index = math.floor(time_seconds / STEP_SECONDS)
    local_progress = (time_seconds % STEP_SECONDS) / STEP_SECONDS
    current = point_for_step(step_index, sample)
    previous = point_for_step(step_index - 1, sample)
    transition_portion = min(0.42, TRANSITION_SECONDS / STEP_SECONDS)

    if local_progress > transition_portion:
        return current

    amount = smoothstep(local_progress / transition_portion)
    return tuple(lerp(previous[i], current[i], amount) for i in range(3))


def projector(eye_offset):
    eye_width = RENDER["eye_width"]
    height = RENDER["height"]
    focal = eye_width / (2 * math.tan(math.radians(FOV_DEGREES) / 2))

    def project(point):
        x, y, z = point
        depth = max(0.1, -z)
        sx = eye_width / 2 + ((x - eye_offset) / depth) * focal
        sy = height / 2 - (y / depth) * focal
        return (sx, sy, depth)

    return project


def draw_projected_line(draw, project, a, b, color, width=1):
    ax, ay, az = project(a)
    bx, by, bz = project(b)
    if az <= 0 or bz <= 0:
        return
    draw.line((ax, ay, bx, by), fill=color, width=width)


def draw_depth_frame(draw, project, depth, color):
    frame_width = min(3.8, max(0.38, depth * 0.5))
    frame_height = min(2.2, max(0.24, depth * 0.3))
    z = -depth
    left = -frame_width / 2
    right = frame_width / 2
    top = frame_height / 2
    bottom = -frame_height / 2
    corners = [(left, bottom, z), (right, bottom, z), (right, top, z), (left, top, z)]
    for i in range(4):
        draw_projected_line(draw, project, corners[i], corners[(i + 1) % 4], color)


def make_background(sample, side):
    eye_offset = -IPD_METERS / 2 if side == "left" else IPD_METERS / 2
    project = projector(eye_offset)
    image = Image.new("RGB", (RENDER["eye_width"], RENDER["height"]), (8, 10, 14))
    draw = ImageDraw.Draw(image, "RGBA")

    grid_color = (55, 78, 96, 105)
    frame_color = (70, 98, 118, 125)
    axis_color = (86, 128, 150, 145)
    grid_far = max(8.0, sample["far"])

    for z in [0.5 + i * 0.5 for i in range(int((grid_far - 0.5) / 0.5) + 1)]:
        draw_projected_line(draw, project, (-3.2, FLOOR_Y, -z), (3.2, FLOOR_Y, -z), grid_color)
    for i in range(-6, 7):
        x = i * 0.5
        draw_projected_line(draw, project, (x, FLOOR_Y, -0.4), (x, FLOOR_Y, -grid_far), grid_color)

    distance_range = sample["far"] - sample["near"]
    for i in range(5):
        draw_depth_frame(draw, project, sample["near"] + distance_range * (i / 4), frame_color)
    draw_projected_line(draw, project, (0, -0.85, -sample["near"]), (0, -0.85, -sample["far"]), axis_color, width=2)
    return image


def make_target_sprite(radius):
    ring_radius = int(radius * 4.8)
    margin = int(radius * 1.2)
    size = (ring_radius + margin) * 2
    center = size / 2
    sprite = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sprite, "RGBA")

    for scale, alpha in [(4.8, 38), (3.3, 62), (2.1, 90)]:
        rr = radius * scale
        draw.ellipse((center - rr, center - rr, center + rr, center + rr), fill=(72, 210, 180, alpha))
    sprite = sprite.filter(ImageFilter.GaussianBlur(radius=max(1, radius * 0.45)))
    draw = ImageDraw.Draw(sprite, "RGBA")
    draw.ellipse(
        (center - ring_radius, center - ring_radius, center + ring_radius, center + ring_radius),
        outline=(68, 104, 126, 155),
        width=2,
    )
    draw.ellipse((center - radius, center - radius, center + radius, center + radius), fill=(90, 244, 210, 245))
    core = radius * 0.35
    draw.ellipse((center - core, center - core, center + core, center + core), fill=(220, 255, 245, 250))
    return sprite


def build_sprite_cache():
    return {radius: make_target_sprite(radius) for radius in range(7, 29)}


def draw_target(image, sample, side, position, sprites):
    if side != sample["active_eye"]:
        return

    eye_offset = -IPD_METERS / 2 if side == "left" else IPD_METERS / 2
    project = projector(eye_offset)
    sx, sy, depth = project(position)
    eye_width = RENDER["eye_width"]
    height = RENDER["height"]
    if sx < -90 or sx > eye_width + 90 or sy < -90 or sy > height + 90:
        return

    focal = eye_width / (2 * math.tan(math.radians(FOV_DEGREES) / 2))
    radius = int(round(max(7, min(28, focal * 0.026 / depth))))
    sprite = sprites[radius]
    image.paste(sprite, (int(sx - sprite.width / 2), int(sy - sprite.height / 2)), sprite)


def render_frame(left_bg, right_bg, sample, frame_index, sprites):
    time_seconds = frame_index / RENDER["fps"]
    position = target_for_time(time_seconds, sample)
    left = left_bg.copy()
    right = right_bg.copy()
    draw_target(left, sample, "left", position, sprites)
    draw_target(right, sample, "right", position, sprites)

    frame = Image.new("RGB", (RENDER["width"], RENDER["height"]))
    frame.paste(left, (0, 0))
    frame.paste(right, (RENDER["eye_width"], 0))
    return frame


def run_encoder(sample, out_path):
    total_frames = int(RENDER["duration"] * RENDER["fps"])
    left_bg = make_background(sample, "left")
    right_bg = make_background(sample, "right")
    sprites = build_sprite_cache()

    with av.open(str(out_path), mode="w", format="matroska") as container:
        stream = container.add_stream("libx264", rate=RENDER["fps"])
        stream.width = RENDER["width"]
        stream.height = RENDER["height"]
        stream.pix_fmt = "yuv420p"
        stream.options = {"crf": "23", "preset": "ultrafast"}
        stream.metadata["stereo_mode"] = "left_right"

        for frame_index in range(total_frames):
            image = render_frame(left_bg, right_bg, sample, frame_index, sprites)
            video_frame = av.VideoFrame.from_image(image)
            for packet in stream.encode(video_frame):
                container.mux(packet)
            if frame_index and frame_index % (RENDER["fps"] * 30) == 0:
                print(f"  {sample['name']}: {frame_index // RENDER['fps']}s / {RENDER['duration']}s", flush=True)

        for packet in stream.encode():
            container.mux(packet)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", choices=[item["name"] for item in SAMPLES], help="Render one sample only.")
    parser.add_argument("--out-dir", default="video_samples")
    parser.add_argument("--duration", type=int, default=DEFAULT_DURATION_SECONDS)
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    parser.add_argument("--eye-width", type=int, default=DEFAULT_EYE_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    args = parser.parse_args()

    RENDER["duration"] = args.duration
    RENDER["fps"] = args.fps
    RENDER["eye_width"] = args.eye_width
    RENDER["height"] = args.height
    RENDER["width"] = args.eye_width * 2

    out_dir = ROOT / args.out_dir
    out_dir.mkdir(exist_ok=True)
    selected = [item for item in SAMPLES if args.sample in (None, item["name"])]

    for sample in selected:
        out_path = out_dir / f"{sample['name']}.mkv"
        print(f"Rendering {out_path.name}", flush=True)
        run_encoder(sample, out_path)


if __name__ == "__main__":
    main()
