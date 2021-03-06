'use strict';

const nconf = require.main.require('nconf');
const url = require('url');
const winston = require.main.require('winston');
const controllers = require('./lib/controllers');
const user = require.main.require('./src/user')
const translator = require.main.require('./src/translator');
const request = require.main.require('request');
const async = require.main.require('async');
const striptags = require('striptags');
const meta = require.main.require('./src/meta');
const { v4: uuidv4 } = require.main.require('uuid')

const plugin = {};

plugin.init = async (params) => {
	const { router, middleware/* , controllers */ } = params;
	const routeHelpers = require.main.require('./src/routes/helpers');

	/**
	 * We create two routes for every view. One API call, and the actual route itself.
	 * Use the `setupPageRoute` helper and NodeBB will take care of everything for you.
	 *
	 * Other helpers include `setupAdminPageRoute` and `setupAPIRoute`
	 * */
	routeHelpers.setupPageRoute(router, '/firebase-notification', middleware, [(req, res, next) => {
		winston.info(`[plugins/firebase-notification] In middleware. This argument can be either a single middleware or an array of middlewares`);
		setImmediate(next);
	}], (req, res) => {
		winston.info(`[plugins/firebase-notification] Navigated to ${nconf.get('relative_path')}/firebase-notification`);
		res.sendStatus(200);	// replace this with res.render('templateName');
	});
	routeHelpers.setupAdminPageRoute(router, '/admin/plugins/firebase-notification', middleware, [], controllers.renderAdminPage);
	plugin.reloadSettings();
};

plugin.reloadSettings = async() => {
	meta.settings.get('firebase-notification',(err, settings) => {
		if (err) {
			winston.error(`[plugins/firebase-notification] Error while loading settings ${err}]`)
			return;
		}
		if (!settings.hasOwnProperty('url') || !settings.url.length) {
			winston.error('[plugins/firebase-notification] no url given');
			return;
		}
		plugin.settings = {};
		plugin.settings.url = settings.url;
		plugin.ready = true;
	});
}

plugin.addRoutes = async ({ router, middleware, helpers }) => {
	router.get('/firebase-notification/:param1', middleware.authenticate, (req, res) => {
		helpers.formatApiResponse(200, res, {
			foobar: req.params.param1,
		});
	});
};

plugin.addAdminNavigation = function (header, callback) {
	header.plugins.push({
		route: '/plugins/firebase-notification',
		icon: 'fa-tint',
		name: 'Firebase-Notification',
	});

	callback(null, header);
};

plugin.sendNotificationToFirebase = async function(data) {
	const requestId = uuidv4()
	var notifObj = data.notification
	var uids = data.uids
	var path = notifObj.path
	var notificationId = notifObj.nid
	var fromUid = notifObj.from
	console.log(notifObj);

	if (!Array.isArray(uids) || !uids.length || !notifObj) {
		return;
	}
	const usernames = await user.getUsersFields(uids, ['username']);
	const from = await user.getUserField(fromUid, 'username');
	async.waterfall([
		function(next) {
			translator.translate(notifObj.bodyShort, function(translated) {
				var notificationBody = translated.replace(/<strong>/g, '').replace(/<\/strong>/g, '')
				next(null, striptags(notificationBody), from)
			});
		},
		function(text, next) {
			const body = {
				usernames: usernames,
				notification: text,
				path: url.resolve(nconf.get('url'), `${path}?_=${notifObj.datetime}`),
				notificationId: notificationId,
				from: from,
				notificationTime: notifObj.datetime
			};
			winston.info(`[plugins/firebase-notification] [${requestId}] Request body sending to firebase [${JSON.stringify(body)}]`)
			winston.info(`[plugins/firebase-notification] [${requestId}] Sending notification to usernames [${usernames}]`)
			request({
				url:'https://asia-south1-doraa-e7dd2.cloudfunctions.net/sendNotification',
				method:'POST',
				body: body,
				json: true
			}, function(err, request, result) {
			if (err) {
				winston.error(`[plugins/firebase-notification] [${requestId}] [${err.message}]`);
			} else if (result.length) {
				winston.info(`[plugin/firebase-notification] [${requestId}] [${result}]`);
			}
		})
		}
	]);

	return;

}

module.exports = plugin;
