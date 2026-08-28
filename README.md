# ez-volume

GNOME Shell extension. Adds **per-application volume sliders** inside the
**Sound Output** menu of the Quick Settings panel — a small inline mixer, like
the Playback tab of `pavucontrol` without leaving the shell.

![where it shows up: Quick Settings → Sound Output arrow → "Volume Levels" section](docs/screenshot.png)

## What it does

- Opens the Quick Settings panel → clicks the arrow on the **Sound Output**
  slider → a **Volume Levels** section appears right below the output-device
  list (above *Sound Settings*).
- One slider per running application playback stream (`Gvc.MixerSinkInput`),
  plus the persistent **System Sounds** stream.
- Each row is `[app icon] [ app label / volume slider ]`. The label is the
  stream `name — description` (e.g. `Firefox — AudioStream`).
- Sliders appear and disappear live as apps start and stop playing.

Nothing else: no panel widgets, no preferences, no input/microphone handling.
It is a stripped-down fork of
[Quick Settings Audio Panel](https://github.com/rayzeq/quicksettings-audio-panel)
doing this one job.

## Requirements

- GNOME Shell **46, 47, or 48**
- PipeWire or PulseAudio (whatever `gnome-shell` already talks to via `Gvc`)

## Install

### From source

```sh
git clone https://github.com/ArturEndres/ez-volume.git
ln -s "$PWD/ez-volume" ~/.local/share/gnome-shell/extensions/volume-levels@stei
```

Then reload GNOME Shell:

- **X11:** <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r`, <kbd>Enter</kbd>
- **Wayland:** log out and back in

Enable it:

```sh
gnome-extensions enable volume-levels@stei
```

## Development

```sh
node --check extension.js          # syntax
journalctl --user -f | grep -i volume-levels   # watch for runtime errors
```

Files:

| File             | Purpose                                              |
|------------------|-----------------------------------------------------|
| `extension.js`   | all logic — slider class, mixer wiring, menu inject |
| `stylesheet.css` | label padding                                        |
| `metadata.json`  | uuid, name, supported shell versions                 |

### How it hooks in

`StreamSlider` is not exported by `gnome-shell`, so the per-app slider class is
derived at runtime from the live output slider's prototype
(`Object.getPrototypeOf(_volumeOutput._output.constructor)`). The class is
registered with a unique `GTypeName` each time, because `gnome-shell` reloads
the module on every disable/enable but a GObject type name stays registered for
the life of the shell process.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
