# Capturing real product footage

Scripts that drive the live site on a phone-sized screen with Playwright and record it. They need a demo account (never a real student's) whose email and password sit in a JSON file outside git:
`{"name":"Demo Student","handle":"demo_x","email":"...","password":"..."}` and `DEMO_ACCOUNT=/path/to/file.json`.

`lib.js` logs in, dismisses the one-time welcome pop-ups before recording starts, hides the "confirm your email" bar, and records a clip with the moments you mark. `batch.js` holds the jobs (`node batch.js quiz`). Raw recordings are 390x844 and are cropped and upscaled to 780x1688 with ffmpeg before use (see creative/asset-register.md).
