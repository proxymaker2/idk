
import { Emitter, isBoolean, isBuffer, isFunction, isObject, isString } from '../../extern/base.mjs';
import { ENVIRONMENT                                                  } from '../ENVIRONMENT.mjs';
import { IP                                                           } from '../parser/IP.mjs';
import { Client, isClient                                             } from '../Client.mjs';



const CONNECTION = [ 'offline', 'mobile', 'broadband', 'peer', 'i2p', 'tor' ];

const toDomain = function(payload) {

	let domain = null;

	if (isString(payload.domain)) {

		if (isString(payload.subdomain)) {
			domain = payload.subdomain + '.' + payload.domain;
		} else {
			domain = payload.domain;
		}

	} else if (isString(payload.host)) {
		domain = payload.host;
	}

	return domain;

};

const toRequest = function(payload) {

	if (
		isObject(payload)
		&& isObject(payload.headers)
		&& isString(payload.headers.service)
		&& (isString(payload.headers.method) || isString(payload.headers.event))
		&& (payload.payload === null || isBoolean(payload.payload) || isBuffer(payload.payload) || isObject(payload.payload))
	) {

		if (payload.headers.service === 'peer' && payload.headers.method === 'proxy') {
			return null;
		}

		return {
			headers: {
				service: payload.headers.service || null,
				method:  payload.headers.method  || null,
				event:   payload.headers.event   || null
			},
			payload: payload.payload
		};

	}


	return null;

};

const connect_client = function(hosts, callback) {

	let success = false;
	let client  = new Client({
		host: hosts.shift().ip
	});

	client.once('connect', () => {

		success = true;

		if (this.stealth.peers.includes(client) === false) {
			this.stealth.peers.push(client);
		}

		callback(client);

	});

	client.once('disconnect', () => {

		let index = this.stealth.peers.indexOf(client);
		if (index !== -1) {
			this.stealth.peers.splice(index, 1);
		}


		if (success === false) {

			if (hosts.length > 0) {
				connect_client.call(this, hosts, callback);
			} else {
				callback(null);
			}

		}

	});

	client.connect();

};

const connect_peer = function(hosts, callback) {

	if (hosts.length > 0) {

		let client = null;

		hosts.forEach((host) => {

			if (client === null) {

				let peer = this.stealth.peers.find((p) => p.address === host.ip) || null;
				if (isClient(peer) === true) {

					if (peer.is('connected') === true) {

						client = peer;

					} else {

						let index = this.stealth.peers.indexOf(peer);
						if (index !== -1) {
							this.stealth.peers.splice(index, 1);
						}

					}

				}

			}

		});

		if (isClient(client) === true && client.is('connected') === true) {
			callback(client);
		} else {
			connect_client.call(this, hosts, callback);
		}

	} else {

		callback(null);

	}

};

const handle_request = (client, request, callback) => {

	let service = client.services[request.headers.service] || null;
	if (service !== null) {

		if (request.headers.event !== null) {

			let response = service.emit(request.headers.event, [ request.payload ]);
			if (response !== null) {
				callback(response);
			} else {
				callback(null);
			}

		} else if (request.headers.method !== null) {

			if (isFunction(service[request.headers.method])) {

				service[request.headers.method](request.payload, (response) => {
					callback(response);
				});

			} else {
				callback(null);
			}

		} else {
			callback(null);
		}

	} else {
		callback(null);
	}

};



const Peer = function(stealth) {

	this.stealth = stealth;
	Emitter.call(this);

};


Peer.isPeer = function(payload) {

	if (
		isObject(payload)
		&& isString(payload.domain)
		&& isString(payload.connection)
		&& CONNECTION.includes(payload.connection)
	) {
		return true;
	}


	return false;

};


Peer.toPeer = function(payload) {

	if (isObject(payload)) {

		let domain = null;

		if (isString(payload.domain)) {

			if (isString(payload.subdomain)) {
				domain = payload.subdomain + '.' + payload.domain;
			} else {
				domain = payload.domain;
			}

		} else if (isString(payload.host)) {
			domain = payload.host;
		}

		if (domain !== null && isString(payload.connection)) {

			return {
				domain:     domain,
				connection: CONNECTION.includes(payload.connection) ? payload.connection : 'offline'
			};

		}

	}


	return null;

};


Peer.prototype = Object.assign({}, Emitter.prototype, {

	info: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		if (callback !== null) {

			callback({
				headers: {
					service: 'peer',
					event:   'info'
				},
				payload: {
					domain:     ENVIRONMENT.hostname,
					connection: this.stealth.settings.internet.connection
				}
			});

		}

	},

	proxy: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		let host    = null;
		let peer    = null;
		let domain  = toDomain(payload);
		let request = toRequest(payload);

		if (domain !== null) {

			host = this.stealth.settings.hosts.find((h) => h.domain === domain) || null;
			peer = this.stealth.settings.peers.find((p) => p.domain === domain) || null;

			if (host === null && isString(payload.host)) {
				host = {
					domain: domain,
					hosts:  [ IP.parse(payload.host) ]
				};
			}

		}

		if (host !== null && peer === null) {

			if (request.headers.service === 'peer' && request.headers.method === 'info') {

				peer = {
					domain:     domain,
					connection: 'peer'
				};

			}

		}


		if (host !== null && peer !== null && request !== null) {

			connect_peer.call(this, IP.sort(host.hosts), (client) => {

				if (client !== null) {

					handle_request(client, request, (response) => {

						if (response !== null) {

							if (callback !== null) {

								callback({
									headers: {
										service: 'peer',
										event:   'proxy'
									},
									payload: response
								});

							}

						} else {

							if (callback !== null) {

								callback({
									_warn_: true,
									headers: {
										service: 'peer',
										event:   'proxy'
									},
									payload: null
								});

							}

						}

					});

				} else {

					if (callback !== null) {

						callback({
							headers: {
								service: 'peer',
								event:   'proxy'
							},
							payload: null
						});

					}

				}

			});

		} else {

			if (callback !== null) {

				callback({
					_warn_: true,
					headers: {
						service: 'peer',
						event:   'proxy'
					},
					payload: null
				});

			}

		}

	},

	read: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		let peer   = null;
		let domain = toDomain(payload);
		if (domain !== null) {
			peer = this.stealth.settings.peers.find((p) => p.domain === domain) || null;
		}


		if (callback !== null) {

			callback({
				headers: {
					service: 'peer',
					event:   'read'
				},
				payload: peer
			});

		}

	},

	refresh: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		let host   = null;
		let peer   = null;
		let domain = toDomain(payload);
		if (domain !== null) {

			host = this.stealth.settings.hosts.find((h) => h.domain === domain) || null;
			peer = this.stealth.settings.peers.find((p) => p.domain === domain) || null;

			if (host === null && isString(payload.host)) {
				host = {
					domain: domain,
					hosts:  [ IP.parse(payload.host) ]
				};
			}

		}

		if (host !== null && peer !== null) {

			connect_peer.call(this, IP.sort(host.hosts), (client) => {

				if (client !== null) {

					client.services.peer.info(null, (response) => {

						if (response !== null) {

							if (CONNECTION.includes(response.connection)) {
								peer.connection = response.connection;
							}

						}

						if (callback !== null) {

							callback({
								headers: {
									service: 'peer',
									event:   'refresh'
								},
								payload: peer
							});

						}

					});

				} else {

					if (callback !== null) {

						callback({
							headers: {
								service: 'peer',
								event:   'refresh'
							},
							payload: null
						});

					}

				}

			});

		} else {

			callback({
				headers: {
					service: 'peer',
					event:   'refresh'
				},
				payload: null
			});

		}

	},

	remove: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		let peer   = null;
		let domain = toDomain(payload);
		if (domain !== null) {
			peer = this.stealth.settings.peers.find((p) => p.domain === domain) || null;
		}

		if (peer !== null) {
			this.stealth.settings.peers.remove(peer);
			this.stealth.settings.save();
		}


		if (callback !== null) {

			callback({
				headers: {
					service: 'peer',
					event:   'remove'
				},
				payload: (domain !== null)
			});

		}

	},

	save: function(payload, callback) {

		callback = isFunction(callback) ? callback : null;


		let peer_old = null;
		let peer_new = Peer.toPeer(payload);

		let domain = toDomain(payload);
		if (domain !== null) {
			peer_old = this.stealth.settings.peers.find((p) => p.domain === domain) || null;
		}

		if (peer_new !== null) {

			if (peer_old !== null) {

				peer_old.connection = peer_new.connection;

			} else {
				this.stealth.settings.peers.push(peer_new);
			}

			this.stealth.settings.save();

		}


		if (callback !== null) {

			callback({
				headers: {
					service: 'peer',
					event:   'save'
				},
				payload: (peer_new !== null)
			});

		}

	}

});


export { Peer };

