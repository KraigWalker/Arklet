/**
 * [initExpressApp description]
 * @return {[type]} [description]
 */
function initExpressApp() {
	if (this.app) {
		return this;
	}
	this.initDatabase();
	this.initExpressSession();
	this.app = require('../../server/createApp')(this);
	return this;
}

module.exports = initExpressApp;
