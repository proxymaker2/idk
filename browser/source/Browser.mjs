
import { Peer    } from './Peer.mjs';
import { Sandbox } from './Sandbox.mjs';



const Browser = function(data) {

	let settings = Object.assign({
		host: 'localhost',
		port: 65432
	}, data);


	// TODO: Local DNS resolver with persistent memory
	// that writes automatically to a hosts-file
	// this.dns  = new Nameservice();

	this.tab  = null;

	this.mode = 'offline';
	this.tabs = [];
	this.peer = new Peer({
		host: settings.host,
		port: settings.port
	});

	this.__configs = [{
		domain:    'old.reddit.com',
		texts:     true,
		images:    true,
		videos:    false,
		downloads: true
	}, {
		domain:    'www.reddit.com',
		texts:     false,
		images:    true,
		videos:    true,
		downloads: false
	}, {
		domain:    'qux.reddit.com',
		texts:     false,
		images:    true,
		videos:    true,
		downloads: false
	}, {
		domain:    'bar.qux.reddit.com',
		texts:     false,
		images:    true,
		videos:    true,
		downloads: false
	}];

	this.__events = {};

};


Browser.MODES = [
	'offline',
	'covert',
	'stealth',
	'online'
];


Browser.prototype = {

	on: function(event, callback) {

		event    = typeof event === 'string'    ? event    : null;
		callback = callback instanceof Function ? callback : null;


		if (event !== null) {

			let events = this.__events[event] || null;
			if (events === null) {
				events = this.__events[event] = [];
			}

			events.push(callback);

			return true;

		}


		return false;

	},

	fire: function(event, args) {

		event = typeof event === 'string' ? event : null;
		args  = args instanceof Array     ? args  : [];


		if (event !== null) {

			let events = this.__events[event] || null;
			if (events !== null) {
				events.forEach(c => c.apply(null, args));
			}

			return true;

		}


		return false;

	},

	off: function(event, callback) {

		event    = typeof event === 'string'    ? event    : null;
		callback = callback instanceof Function ? callback : null;


		if (event !== null) {

			let events = this.__events[event] || null;
			if (events !== null) {

				if (callback !== null) {
					this.__events[event] = events.filter(c => c !== callback);
				} else {
					this.__events[event] = [];
				}

			}

			return true;

		}


		return false;

	},

	config: function(url) {

		url = typeof url === 'string' ? url : null;


		if (url !== null) {

			let domain = null;

			if (url.startsWith('https://') || url.startsWith('http://')) {
				domain = url.split('/').slice(2)[0];
			}

			if (domain !== null) {

				let configs = this.__configs.filter(cfg => domain.endsWith(cfg.domain));
				if (configs.length > 1) {

					return configs.sort((a, b) => {
						if (a.domain.length > b.domain.length) return -1;
						if (b.domain.length > a.domain.length) return  1;
						return 0;
					})[0];

				} else if (configs.length === 1) {

					return configs[0];

				} else {

					let config = {
						domain:    domain,
						texts:     false,
						images:    false,
						videos:    false,
						downloads: false
					};

					let mode = this.mode;
					if (mode === 'online') {
						config.texts     = true;
						config.images    = true;
						config.videos    = true;
						config.downloads = true;
					} else if (mode === 'stealth') {
						config.texts     = true;
						config.images    = true;
						config.videos    = false;
						config.downloads = false;
					} else if (mode === 'covert') {
						config.texts     = true;
						config.images    = false;
						config.videos    = false;
						config.downloads = false;
					} else if (mode === 'offline') {
						// XXX: Don't load anything
					}

					return config;

				}

			}

		}


		return null;

	},

	kill: function(tab, callback) {

		tab      = tab instanceof Sandbox       ? tab      : null;
		callback = callback instanceof Function ? callback : null;


		if (tab !== null) {

			if (this.tabs.includes(tab) === true) {

				this.tabs.splice(this.tabs.indexOf(tab), 1);

				if (typeof tab.kill === 'function') {
					tab.kill();
				}

			}

			this.fire('kill', [ tab, this.tabs ]);

			if (this.tab === tab) {

				if (this.tabs.length > 0) {
					this.show(this.tabs[this.tabs.length - 1]);
				}

			} else {

				this.tab = null;

			}

			if (callback !== null) {
				callback(tab);
			}

			return true;

		}

	},

	show: function(tab, callback) {

		tab      = tab instanceof Sandbox       ? tab      : null;
		callback = callback instanceof Function ? callback : null;


		if (tab !== null) {

			if (this.tabs.includes(tab) === false) {
				this.tabs.push(tab);
			}

			if (this.tab !== null) {
				this.fire('hide', [ this.tab, this.tabs ]);
			}

			if (this.tab !== tab) {

				this.tab = tab;
				this.fire('show', [ tab, this.tabs ]);

				if (callback !== null) {
					callback(tab);
				}

			}

			return true;

		} else if (tab === null) {

			if (this.tab !== null) {
				this.fire('hide', [ this.tab, this.tabs ]);
			}

			if (this.tabs.length > 0) {
				this.tab = this.tabs[this.tabs.length - 1];
				this.fire('show', [ this.tab, this.tabs ]);
			} else {
				this.tab = null;
			}

			if (callback !== null) {
				callback(tab);
			}

			return true;

		}


		return false;

	},

	create: function(url) {

		url = typeof url === 'string' ? url : null;


		let mode = this.mode;

		if (url !== null) {

			let cfg = this.config(url);
			if (cfg !== null) {
				mode = cfg.mode;
			}

		}


		let tab = this.tabs.find(t => t.url === url) || null;
		if (tab !== null) {

			// TODO: Should changed mode trigger a reload?
			// Probably bad user experience ...

			return tab;

		} else {

			tab = new Sandbox({
				peer: this.peer,
				mode: mode,
				url:  url
			});

			this.tabs.push(tab);
			this.fire('create', [ tab, this.tabs ]);

		}


		return tab;

	},

	setMode: function(mode) {

		mode = typeof mode === 'string' ? mode : null;


		if (mode !== null) {

			mode = mode.toLowerCase();

			let check = Browser.MODES.includes(mode);
			if (check === true) {

				this.mode = mode;

				return true;

			}

		}


		return false;

	}

};


export { Browser };

