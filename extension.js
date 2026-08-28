/* Volume Levels — per-application volume sliders inside the Sound Output menu.
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Forked down from Quick Settings Audio Panel (rayzeq) to do exactly one thing:
 * inject an application mixer into OutputVolumeSlider.menu (the "Sound Output"
 * popup), right below the output-device list.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

const {MixerSinkInput} = Gvc;
const QuickSettings = Main.panel.statusArea.quickSettings;

// _volumeOutput is populated in an async init, so poll for it.
// ponytail: 50ms poll, fine for a one-shot startup wait.
// Returns {promise, cancel} so disable() can stop a poll still in flight
// (otherwise the interval leaks and enable() keeps building UI after disable).
function waitProperty(obj, name) {
    let id = 0;
    let reject;
    const promise = new Promise((res, rej) => {
        reject = rej;
        id = setInterval(() => {
            if (obj[name] !== undefined && obj[name] !== null) {
                clearInterval(id);
                id = 0;
                res(obj[name]);
            }
        }, 50);
    });
    return {
        promise,
        cancel() {
            if (id) {
                clearInterval(id);
                id = 0;
                reject(new Error('cancelled'));
            }
        },
    };
}

function labelText(stream) {
    const n = stream.name;
    const d = stream.description;
    if (!n)
        return d || '';
    return !d ? n : `${n} — ${d}`;
}

// StreamSlider isn't exported, so derive it from the live output slider's
// prototype. gnome-shell reloads this module on every disable/enable, but a
// GObject type name stays registered for the life of the shell process — so a
// fixed GTypeName throws "already registered" on the second enable. Use a
// unique name per registration.
function makeAppSliderClass(StreamSlider) {
    return GObject.registerClass({
        GTypeName: `VLAppSlider_${Date.now()}`,
    },
    class VLAppSlider extends StreamSlider {
        constructor(control, stream) {
            super(control);

            // never show the per-app "move to device" submenu: its menu actor
            // would be unparented here and clicking it would break.
            this.menuEnabled = false;

            this._icons = [stream.name ? stream.name.toLowerCase() : stream.icon_name];
            this.stream = stream;
            this._icon.fallback_icon_name = stream.icon_name || 'audio-x-generic-symbolic';

            this._iconButton.y_expand = false;
            this._iconButton.y_align = Clutter.ActorAlign.CENTER;

            // rebuild the row as: [icon] [ label / slider ]
            const box = this.child;
            const sliderBin = box.get_children()[1];
            box.remove_child(sliderBin);
            box.remove_child(this._menuButton);

            const vbox = new St.BoxLayout({vertical: true, x_expand: true});
            box.insert_child_at_index(vbox, 1);

            const label = new St.Label({natural_width: 0, style_class: 'vl-app-label'});
            const update = () => (label.text = labelText(stream));
            stream.connectObject('notify::description', update, 'notify::name', update, this);
            update();

            vbox.add_child(label);
            vbox.add_child(sliderBin);
        }
    });
}

export default class VolumeLevels extends Extension {
    async enable() {
        this._wait = waitProperty(QuickSettings, '_volumeOutput');
        let volumeOutput;
        try {
            volumeOutput = await this._wait.promise;
        } catch (_e) {
            return; // disabled before _volumeOutput showed up
        }
        this._wait = null;
        this._output = volumeOutput._output;
        this._AppSlider = makeAppSliderClass(Object.getPrototypeOf(this._output.constructor));

        this._mixer = Volume.getMixerControl();
        this._sliders = new Map();

        this._section = new PopupMenu.PopupMenuSection();
        this._separator = new PopupMenu.PopupSeparatorMenuItem('Volume Levels');
        this._section.addMenuItem(this._separator);
        // position 1 == right after the output-device list, above "Sound Settings"
        this._output.menu.addMenuItem(this._section, 1);

        this._addId = this._mixer.connect('stream-added', (_c, id) => this._add(id));
        this._removeId = this._mixer.connect('stream-removed', (_c, id) => this._remove(id));
        for (const s of this._mixer.get_streams())
            this._add(s.id);

        this._syncVisibility();
    }

    disable() {
        this._wait?.cancel();
        this._wait = null;

        if (this._mixer) {
            this._mixer.disconnect(this._addId);
            this._mixer.disconnect(this._removeId);
        }
        for (const sl of this._sliders?.values() ?? [])
            sl.destroy();
        this._section?.destroy();
        this._output?._sync(); // let gnome-shell recompute menuEnabled

        this._sliders = null;
        this._section = null;
        this._separator = null;
        this._output = null;
        this._mixer = null;
        this._AppSlider = null;
    }

    _add(id) {
        if (this._sliders.has(id))
            return;
        const stream = this._mixer.lookup_stream_id(id);
        // ponytail: include event streams too (that's the persistent "System Sounds"
        // entry the user wants). Drop `|| stream.is_event_stream` if they flicker.
        if (!stream || !(stream instanceof MixerSinkInput))
            return;

        const sl = new this._AppSlider(this._mixer, stream);
        this._sliders.set(id, sl);
        this._section.box.add_child(sl);
        this._syncVisibility();
    }

    _remove(id) {
        const sl = this._sliders.get(id);
        if (!sl)
            return;
        this._section.box.remove_child(sl);
        sl.destroy();
        this._sliders.delete(id);
        this._syncVisibility();
    }

    _syncVisibility() {
        const has = this._sliders.size > 0;
        this._separator.visible = has;
        // the master menu's arrow only shows / opens when menuEnabled; force it
        // while we have app sliders (gnome-shell sets it from device count).
        // When the last app slider goes away, let gnome-shell recompute so the
        // arrow doesn't linger on an empty menu.
        if (has)
            this._output.menuEnabled = true;
        else
            this._output._sync();
    }
}
