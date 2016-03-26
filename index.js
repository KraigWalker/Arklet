/* eslint no-console: 0*/
// 'use strict';

const _ = require('lodash');
const express = require('express');
const fs = require('fs');
const grappling = require('grappling-hook');
const path = require('path');
const utils = require('arklet-utils');

/**
 * Don't use process.cwd() as it breaks module encapsulation
 * Instead, use module.parent if it's present, or the module itself if there is
 * no parent (the module is probably being unit tested if that is the case)
 *
 * This way, the consuming app/module can be an embedded node_module and path
 * resolutions will still work (provess.cwd() breaks module encapsulation if
 * the consuming app/module is itself a node module)
 */
const moduleRoot = (_rootPath => {
	const parts = _rootPath.split(path.sep);
	parts.pop();	// get rid of /node_modules from the end of the path
	return parts.join(path.sep);
})(module.parent ? module.parent.paths[0] : module.paths[0]);

/**
 * Arklet Class
 *
 * @api public
 */
class Arklet {

	constructor() {
		grappling.mixin(this).allowHooks(
			'pre:static',
			'pre:bodyparser',
			'pre:session',
			'pre:routes',
			'pre:render',
			'updates',
			'signout',
			'signin',
			'pre:logger'
		);

		this.lists = {};
		this.paths = {};
		this._options = {
			name: 'Arklet',
			brand: 'Arklet',
			'admin path': 'arklet',
			compress: true,
			headless: false,
			logger: ':method :url :status :response-time ms',
			'auto update': false,
			'model prefix': null,
			'module root': moduleRoot,
			'frame guard': 'sameorigin',
		};

		this._redirects = {};

		// Expose Express
		this.express = express;

		// Initialize environment defaults
		this.set('env', process.env.NODE_ENV || 'development');

		this.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT);
		this.set('host', process.env.HOST || process.env.IP || process.env.OPENSHIFT_NODEJS_IP);
		this.set('listen', process.env.LISTEN);

		this.set('ssl', process.env.SSL);
		this.set('ssl port', process.env.SSL_PORT);
		this.set('ssl host', process.env.SSL_HOST || process.env.SSL_IP);
		this.set('ssl key', process.env.SSL_KEY);
		this.set('ssl cert', process.env.SSL_CERT);

		this.set('cookie secret', process.env.COOKIE_SECRET);
		this.set('cookie signin', (this.get('env') === 'development'));

		// TODO: 3rd party API keys and properties (analytics, email, etc.)
		// for now add Allowed IP ranges
		this.set('allowed ip ranges', process.env.ALLOWED_IP_RANGES);

		// Handle
		if (process.env.S3_BUCKET && process.env.S3_KEY &&
			process.env.S3_SECRET) {
			this.set('s3 config', {
				bucket: process.env.S3_BUCKET,
				key: process.env.S3_KEY,
				secret: process.env.S3_SECRET,
				region: process.env.S3_REGION,
			});
		}

		if (process.env.AZURE_STORAGE_ACCOUNT &&
			process.env.AZURE_STORAGE_ACCESS_KEY) {
			this.set('azurefile config', {
				account: process.env.AZURE_STORAGE_ACCOUNT,
				key: process.env.AZURE_STORAGE_ACCESS_KEY,
			});
		}

		if (process.env.CLOUDINARY_URL) {
			// process.env.CLOUDINARY_URL is processed by the cloudinary
			// package when this is set
			this.set('cloudinary config', true);
		}

		// Initialize Mongoose
		this.set('mongoose', require('mongoose'));

		// Attach middleware packages, bound to this instance
		this.middleware = {
			api: require('./lib/middleware/api')(this),
			cors: require('./lib/middleware/cors')(this),
		};

		this.version = require('./package.json').version;

		_.extend(this, require('./lib/core/options'));
	}

	prefixModel(key) {
		const modelPrefix = this.get('model prefix');

		if (modelPrefix) {
			const _newKey = `${modelPrefix}_${key}`;
			return require('mongoose/lib/utils').toCollectionName(_newKey);
		}

		// if there is no model prefix, just use the original key provided
		// Potentially log a warning?
		return require('mongoose/lib/utils').toCollectionName(key);
	}

	/**
	 * returns all .js modules (recursively) in the path specified, relative
	 * to the module root (where the keystone project is being consumed from).
	 *
	 * ####Example:
	 *
	 *     var models = keystone.import('models');
	 *
	 * @param {String} dirname
	 * @api public
	 */
	import(dirname) {
		const initialPath = path.join(this.get('module root'), dirname);

		const doImport = fromPath => {
			const imported = {};

			fs.readdirSync(fromPath).forEach(name => {
				const fsPath = path.join(fromPath, name);
				const info = fs.statSync(fsPath);

				// recur
				if (info.isDirectory()) {
					imported[name] = doImport(fsPath);
				} else {
					// only import files that we can `require`
					const ext = path.extname(name);
					const base = path.basename(name, ext);
					if (require.extensions[ext]) {
						imported[base] = require(fsPath);
					}
				}
			});

			return imported;
		};

		return doImport(initialPath);
	}

	/**
 	 * Applies Application updates
 	 */
	applyUpdates(callback) {
		const self = this;
		self.callHook('pre:updates', error => {
			if (error) {
				return callback(error);
			}
			require('./lib/updates').apply(err => {
				if (err) {
					return callback(err);
				}
				return self.callHook('post:updates', callback);
			});
			return false;
		});
	}
}

/* Attach core functionality to the Arklet class */
Arklet.createItems = require('./lib/core/createItems');
Arklet.getOrphanedLists = require('./lib/core/getOrphanedLists');
Arklet.importer = require('./lib/core/importer');
Arklet.init = require('./lib/core/init');
Arklet.initDatabase = require('./lib/core/initDatabase');
Arklet.initExpressApp = require('./lib/core/initExpressApp');
Arklet.initExpressSession = require('./lib/core/initExpressSession');
Arklet.initNav = require('./lib/core/initNav');
Arklet.list = require('./lib/core/list');
Arklet.openDatabaseConnection = require('./lib/core/openDatabaseConnection');
Arklet.populateRelated = require('./lib/core/populateRelated');
Arklet.redirect = require('./lib/core/redirect');
Arklet.render = require('./lib/core/render');
Arklet.start = require('./lib/core/start');
Arklet.wrapHTMLError = require('./lib/core/wrapHTMLError');

/**
 *
 * Logs a configuration error to the console
 *
 * @api public
 */
Arklet.console = {};
Arklet.console.err = (type, msg) => {
	if (this.get('logger')) {
		const dashes = '\n------------------------------------------------\n';
		console.error(`${dashes}Arklet: ${type}:\n\n ${msg}${dashes}`);
	}
};

// Expose Modules & Classes
Arklet.Admin = {
	Server: require('./admin/server'),
};
Arklet.Email = require('./lib/email');
Arklet.Field = require('./fields/types/Type');
Arklet.Field.Types = require('./lib/fieldTypes');
Arklet.Arklet = Arklet;
Arklet.List = require('./lib/list');
Arklet.View = require('./lib/view');

Arklet.content = require('./lib/content');
Arklet.security = {
	csrf: require('./lib/security/csrf'),
};
Arklet.utils = utils;
Arklet.session = require('./lib/session');

/**
 * The exports object is an instance of Keystone.
 *
 * @api public
 */
module.exports = new Arklet();
