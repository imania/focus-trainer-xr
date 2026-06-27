# VR SBS sample videos

These are 3-minute side-by-side left-right 3D MKV samples for YouTube upload testing.

## Files

- `right_hyperopia_0p4_5m_sbs3d.mkv`
  - Active eye: right
  - Profile: hyperopia / near emphasis
  - Distance range: 0.4m to 5.0m
- `left_hyperopia_0p4_5m_sbs3d.mkv`
  - Active eye: left
  - Profile: hyperopia / near emphasis
  - Distance range: 0.4m to 5.0m
- `right_myopia_0p6_8m_sbs3d.mkv`
  - Active eye: right
  - Profile: myopia / far emphasis
  - Distance range: 0.6m to 8.0m
- `left_myopia_0p6_8m_sbs3d.mkv`
  - Active eye: left
  - Profile: myopia / far emphasis
  - Distance range: 0.6m to 8.0m

## Render settings

- Duration: 180 seconds
- Frame rate: 12 fps
- Layout: SBS 3D, left-right
- Resolution: 1280x360 total, 640x360 per eye
- Container: Matroska `.mkv`
- Metadata: `stereo_mode=left_right`

## Regenerate

```powershell
python tools\generate_vr_samples.py --out-dir video_samples
```

Higher resolution example:

```powershell
python tools\generate_vr_samples.py --out-dir video_samples_hd --fps 24 --eye-width 1280 --height 720
```
