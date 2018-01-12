#! /usr/bin/env node

const Device = require('minidsp/src/device');
const USBTransport = require('minidsp/src/transport/usb');
const Constants = require('minidsp/src/constants');
const fs = require('fs');
const FourteenSegment = require('ht16k33-fourteensegment-display');
const Inotify = require('inotify').Inotify;

const sources = {
	'analog': "AUX",
	'toslink': "OPT",
	'usb': "USB"
}

let _device;
let _display = new FourteenSegment(0x70, 1);
device().transport.device.on('data', process_buffer);

var prev_source = "toslink";
var current_status = {
	source: "analog",
	volume: 0,
	mute: false
}

var sourceTimeout;
var muteTimeout;

// Watch /tmp/MINIDSP-CONTROL for commands
// TODO: non-FS IPC
var inotify = new Inotify();
var watchTmp = {
	path: '/tmp',
	watch_for: Inotify.IN_CLOSE_WRITE,
	callback: function(event) {
		if (event.name == "MINIDSP-CONTROL") {
			try {
				var action = fs.readFileSync("/tmp/MINIDSP-CONTROL", "utf8").trim();
				minidsp_control(action);
				fs.unlinkSync("/tmp/MINIDSP-CONTROL");
			} catch (err) {
				console.log(err);
			}
		}
	}
}
inotify.addWatch(watchTmp);

// Add callback to process_buffer whenever something interesting happens, then update the display for init
device().transport.device.on('data', process_buffer);
device().sendCommand([0x05, 0xFF, 0xD9, 0x03]);

function device() {
	if (_device) {
		return _device;
	}
	return _device = new Device(USBTransport);
}

function process_buffer(data) {
	var status = {
		volume: current_status.volume,
		mute: current_status.mute,
		source: current_status.source
	}
	var slice = data.slice(1, 4);

	// Volume or mute changed
	if (slice.compare(Buffer.from([0x05, 0xFF, 0xDA])) === 0) {
		status.volume = -0.5 * data.readUInt8(4),
		status.mute = !!data.readUInt8(5)

	// Source changed
	} else if (slice.compare(Buffer.from([0x05, 0xFF, 0xA9])) === 0 ||
	           slice.compare(Buffer.from([0x05, 0xFF, 0xD9])) === 0) {
		// FULL info, called by init
		if (slice.compare(Buffer.from([0x05, 0xFF, 0xD9])) === 0 &&
		    data.slice(0, 1).compare(Buffer.from([0x07])) === 0) {
			status.volume = -0.5 * data.readUInt8(5),
			status.mute = !!data.readUInt8(6)
		}
		status.source = Constants.SOURCE_NAME[data.readUInt8(4)];
	// Volume changed by Pi
	} else if (data[1] === 0x42) {
		status.volume = -0.5 * data.readUInt8(2);
	// Mute changed by Pi
	} else if (data[1] == 0x17) {
		status.mute = !!data.readUInt8(2);
	} else {
		console.log(data);
	}
	update_status(status);
}

function update_status(new_status) {
	// PRIORITY:
	// New source > mute > volume

	// New source
	if (new_status.source != current_status.source) {
		var sourceStr = sources[new_status.source];
		if (sourceStr) {
			_display.writeString(sourceStr);
		}
		// In 3 seconds, if it ain't muted show the volume
		if (sourceTimeout) {
			clearTimeout(sourceTimeout);
		}
		sourceTimeout = setTimeout(function() {
			if (!muteTimeout) {
				_display.writeString(vol_str(current_status.volume));
			}
			sourceTimeout = null;
		}, 3000);	

	// Newly muted
	} else if (new_status.mute && !muteTimeout) {
		mute_loop(true);

	// Volume change or unmute
	} else {
		// Clear the mute timeout if the system is unmuted
		if (!new_status.mute && muteTimeout) {
			clearTimeout(muteTimeout);
			muteTimeout = null;
		}
		// If nothing else is showing, update the volume
		if (!sourceTimeout && !muteTimeout) {
			_display.writeString(vol_str(new_status.volume));
		}
	}

	current_status = new_status;
}

function vol_str(source) {
	if (typeof source != 'number') {
		return "";
	}
	if (source <= -100) {
		return Math.round(source).toString();
	} else if (source % 1 === 0) {
		return (source.toString() + ".0");
	} else {
		return source.toString();
	}
}

function mute_loop(show_mute) {
	if (show_mute) {
		if (!sourceTimeout) {
			_display.writeString("MUTE");
		}
		muteTimeout = setTimeout(function() {mute_loop(false);}, 1500);
	} else {
		if (!sourceTimeout) {
			_display.writeString(vol_str(current_status.volume));
		}
		muteTimeout = setTimeout(function() {mute_loop(true);}, 1500);
	}
}

function minidsp_control(command) {
	try {
	switch (command.split(' ')[0]) {
		case "kill":
			console.log("exiting...");
			if (_device) {
				_device.close();
			}
			process.exit()
			break;
		case "source-previous":
			if (prev_source == null) {
				break;
			}
			if (prev_source == current_status.source) {
				prev_source = "toslink";
			}
			console.log("switching to previous source " + prev_source);
			device().setSource(prev_source);
			prev_source = null;
			break;
		case "source-forward":
			var sourcesKeys = Object.keys(sources);
			var newIndex = (sourcesKeys.indexOf(current_status.source) + 1) % sourcesKeys.length;
			var next_source = sourcesKeys[newIndex];
			console.log("switching source to " + next_source);
			prev_source = current_status.source;
			device().setSource(next_source);
			break;
		case "source-analog":
			console.log("switching source to AUX");
			prev_source = current_status.source;
			device().setSource("analog");
			break;
		case "source-toslink":
			console.log("switching source to TOSLINK1");
			prev_source = current_status.source;
			device().setSource("toslink");
			break;
		case "source-usb":
			console.log("switching source to USB");
			prev_source = current_status.source;
			device().setSource("usb");
			break;
		case "volume-up":
			var newvol = current_status.volume + 0.5;
			console.log("setting volume to " + newvol);
			device().setVolume(newvol);
			break;
		case "volume-down":
			var newvol = current_status.volume - 0.5;
			console.log("setting volume to " + newvol);
			device().setVolume(newvol);
			break;
		case "volume-set":
			var newvol = command.split(' ')[1];
			console.log("setting volume to " + newvol);
			device().setVolume(newvol);
			break;
		case "toggle-mute":
			if (current_status.mute) {
				console.log("unmuting");
				device().setMute(false);
			} else {
				console.log("muting");
				device().setMute(true);
			}
			break;
		case "mute":
			console.log("muting");
			device().setMute(true);
			break;
		case "unmute":
			console.log("unmuting");
			device().setMute(false);
			break;
	}
	} catch (err) {
		console.log(err);
	}
}
