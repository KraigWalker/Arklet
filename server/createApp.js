const compression = require('compression');
const favicon = require('serve-favicon');
const methodOverride = require('method-override');
const morgan = require('morgan');

const language = require('../lib/middleware/language');
const createComponentRouter = require('./createComponentRouter');


/**
 * [createApp description]
 * @param  {[type]} arklet  [description]
 * @param  {[type]} express [description]
 * @return {[type]}         [description]
 */
module.exports = function createApp(arklet, express) {
	if (!arklet.app) {
		if (!express) {
			express = require('express');
		}
		arklet.app = express();
	}

	const app = arklet.app;

	arklet.initDatabase();
	arklet.initExpressSession();

	require('./initTrustProxy')(arklet, app);
	require('./initViewEngine')(arklet, app);
	require('./initViewLocals')(arklet, app);
	require('./bindIPRestrictions')(arklet, app);

	// Compress response bodies
	if (arklet.get('compress')) {
		app.use(compression());
	}

	// Run pre:static configuration hooks
	// Fetch hooks
	if (typeof arklet.get('pre:static') === 'function') {
		arklet.get('pre:static')(app);
	}
	// Run hooks
	app.use((req, res, next) => {
		arklet.callHook('pre:static', req, res, next);
	});

	// Serve static assets
	if (arklet.get('favico')) {
		app.use(favicon(arklet.getPath('favico')));
	}

	// unless the headless option is set (which disables the Admin UI),
	// bind the Admin UI's Static Router for public resources
	if (!arklet.get('headless')) {
		app.use(`/${arklet.get('admin path')}`, require('../admin/server').createStaticRouter(arklet));
	}

	require('./bindLessMiddleware')(arklet, app);
	require('./bindSassMiddleware')(arklet, app);
	require('./bindStylusMiddleware')(arklet, app);
	require('./bindStaticMiddleware')(arklet, app);
	require('./bindSessionMiddleware')(arklet, app);

	// Log dynamic requests
	// TODO: What's morgan??
	if (arklet.get('logger')) {
		app.use(morgan(arklet.get('logger'), arklet.get('logger options')));
	}

	// If the user wants to define their own logging middleware,
	// they should be able to do so
	if (arklet.get('logging middleware')) {
		app.use(arklet.get('logging middleware'));
	}

	// We should also allow custom logging middleware to exist in the normal middleware flow
	app.use((req, res, next) => {
		arklet.callHook('pre:logger', req, res, next);
	});

	// unless the headless option is set (which disables the Admin UI),
	// bind the Admin UI's Dynamic Router
	if (!arklet.get('headless')) {
		app.use(`/${arklet.get('admin path')}`, require('../admin/server').createDynamicRouter(arklet));
	}

	// Pre bodyparser middleware
	if (typeof arklet.get('pre:bodyparser') === 'function') {
		arklet.get('pre:bodyparser')(app);
	}
	app.use((req, res, next) => {
		arklet.callHook('pre:bodyparser', req, res, next);
	});
	require('./bindBodyParser')(arklet, app);
	app.use(methodOverride());

	// Set language preferences
	const languageOptions = arklet.get('language options') || {};
	if (!languageOptions.disable) {
		app.use(language(arklet));
	}

	// Add 'X-Frame-Options' to response header for ClickJacking protection
	if (arklet.get('frame guard')) {
		app.use(require('../lib/security/frameGuard')(arklet));
	}

	// Pre route config
	if (typeof arklet.get('pre:routes') === 'function') {
		arklet.get('pre:routes')(app);
	}

	app.use((req, res, next) => {
		arklet.callHook('pre:routes', req, res, next);
	});

		// Configure React routes
	if (arklet.get('react routes')) {
		app.use('/', createComponentRouter(arklet.get('react routes')));
	}

	// Configure application routes
	if (typeof arklet.get('routes') === 'function') {
		arklet.get('routes')(app);
	}

	require('./bindRedirectsHandler')(arklet, app);

	// Error config
	if (typeof arklet.get('pre:error') === 'function') {
		arklet.get('pre:error')(app);
	}
	app.use((req, res, next) => {
		arklet.callHook('pre:error', req, res, next);
	});
	require('./bindErrorHandlers')(arklet, app);

	return app;
};
