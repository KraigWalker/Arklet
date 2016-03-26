/**
 * Pass requests through redirects
 * @module bindErrorHandlers
 */

/**
 * [bindErrorHandlers description]
 * @param  {[type]} arklet [description]
 * @param  {[type]} app    [description]
 * @return {[type]}        [description]
 */
module.exports = function bindErrorHandlers(arklet, app) {
	if (Object.keys(arklet._redirects).length) {
		app.use((req, res, next) => {
			if (arklet._redirects[req.path]) {
				res.redirect(arklet._redirects[req.path]);
			} else {
				next();
			}
		});
	}
};
