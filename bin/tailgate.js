#!/usr/bin/env node

(function() {
    'use strict';

    var env = process.env,
        fs = require('fs'),
        express = require('express'),
        spawn = require('child_process').spawn,
        crypto = require('crypto'),
        log4js = require('log4js'),
        Tailer = require('./tailer'),
        app = express();

    var HOUR_IN_MILLIS = 60 * 60e3,
        SALT = crypto.randomBytes(256),

        server,
        io,
        log,
        sha,
        timeout;

    if (env.SSL_KEY_FILE) {
        server = require('https').createServer({
            key: fs.readFileSync(env.SSL_KEY_FILE,  'utf8'),
            cert: fs.readFileSync(env.SSL_CRT_FILE, 'utf8'),
            ca: fs.readFileSync(env.SSL_BUNDLE_FILE, 'utf8')
        }, app).listen(env.TAILGATE_HTTPS_PORT);
    }
    else {
        server = app.listen(env.TAILGATE_HTTP_PORT);
    }

    io = require('socket.io').listen(server);

    if (env.AUTH_TYPE === 'ldap') {
        var ldap = require('ldapjs');
        var sprintf = require('sprintf').sprintf;
    }

    log = log4js.getLogger();

    if (env.LOGGING === '1') {
        log.setLevel('ALL');
        io.set('log level', 3);
    }
    else {
        log.setLevel('WARN');
        io.set('log level', 0);
    }

    log.info('Starting up Tailgate…');


    // set up static content
    app.use('/js',  express['static'](env.TAILGATE_WEB_DIR + '/js'));
    app.use('/css', express['static'](env.TAILGATE_WEB_DIR + '/css'));
    app.use('/img', express['static'](env.TAILGATE_WEB_DIR + '/img'));

    // set rendering lib
    app.set('view engine', 'ejs');
    app.set('view options', { 'layout': false });

    app.use(express.favicon(env.TAILGATE_WEB_DIR + '/favicon.ico', { maxAge: 2592000000 }));



    function requestAuth(res) {
        res.set('WWW-Authenticate', 'Basic realm="Tailgate Authentication"');
        res.send(401);
    }


    // hash the passwords stored in memory
    function genPass(password) {
        sha = crypto.createHmac('sha256', SALT);
        sha.update(password);
        return sha.digest('hex');
    }

    function authCheck(req, res, next) {

        if (env.SSL_CERT_FILE && !req.secure) {
            return res.redirect('https://' + req.host + ':' + env.TAILGATE_HTTPS_PORT + '/' + req.url);
        }

        if (env.AUTH_TYPE === 'none') {
            return next();
        }

        // extract the user:pass from the header
        if (req.headers.authorization) {
            var parts = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString('utf8').split(':');

            req.username = parts[0];
            req.password =  parts[1];
        }

        if (!req.username || !req.password) {
            return requestAuth(res);
        }

        switch (env.AUTH_TYPE) {
            case 'ldap':
                ldapAuth(req, res, next);
                break;
            case 'simple':
                simpleAuth(req, res, next);
                break;
            default:
                next();
        }
    }

    function simpleAuth(req, res, next) {
        if (!env.SIMPLE_USERNAME || !env.SIMPLE_PASSWORD) {
            res.send(403, 'Authentication required but not defined in config!');
        }

        if (req.username === env.SIMPLE_USERNAME && req.password === env.SIMPLE_PASSWORD) {
            return next();
        }

        requestAuth();
    }

    function ldapAuth(req, res, next) {

        // if it's cached go for it
        if (env.LDAP_CACHE === 'true' && !!ldapAuth.cache[req.username] && genPass(req.password) === ldapAuth.cache[req.username]) {
            return next();
        }

        var ldapAuthClient = ldap.createClient({
                url: env.LDAP_URL,
                log4js: log4js
            }),

            opts = {
                scope: 'sub',
                attributes: 'dn',
                filter: sprintf(env.LDAP_SEARCH_FILTER, req.username)
            };

        log.debug(opts);

        ldapAuthClient.search(env.LDAP_SEARCH_BASE, opts, function(err, ldap_res) {
            var matches = [];

            if (err) {
                log.error(err);
                return requestAuth(res);
            }

            ldap_res.on('error', function(err) {
                log.error(err);
                requestAuth(res);
            });

            ldap_res.on('searchEntry', function(entry) {
                if (entry.dn) {
                    matches.push(entry.dn);
                }
            });

            ldap_res.on('end', function(result) {
                log.debug(matches);

                if (matches.length === 1) {
                    ldapAuthClient.bind(matches[0], req.password, function(err) {
                        if (err) {
                            log.error(err);
                            requestAuth(res);
                        }
                        else {
                            if (env.LDAP_CACHE === 'true') {
                                ldapAuth.cache[req.username] = genPass(req.password);
                            }
                            next();
                        }
                    });
                }
                else {
                    requestAuth(res);
                }
            });
        });
    }

    // initialize the ldap cache
    ldapAuth.cache = {};

    function get_dirs() {
        if (env.TAILER === 'dev') {
            return ['dev1', 'dev2', 'dev3'];
        }
        return fs.readdirSync(env.TAILGATE_DATA_DIR).filter(function(file) {
                    return fs.statSync(env.TAILGATE_DATA_DIR + '/' + file).isDirectory().sort();
                });
    }


    // el monitor
    app.get('/', authCheck, function(req, res) {
        var dirs = get_dirs();
        res.render(env.TAILGATE_WEB_DIR + '/index.ejs', {
            'dirs': dirs,
            'host': req.headers.host,
            'repo': env.REPO_LINK
        });
    });

    app.get('/api', authCheck, function(req, res) {
        var dirs = get_dirs();
        res.render(env.TAILGATE_WEB_DIR + '/api.ejs', {
            'dirs': dirs,
            'host': req.headers.host,
            'repo': env.REPO_LINK
        });
    });

    var tailer = new Tailer();

    // handle killing tailers on shutdown
    function shutdown() {
        try {
            log.warn('Received shutdown signal! Shutting down…');
            tailer.shutdown();
            process.exit(1);
        }
        catch (err) {
          console.log(err);
        }
    }

    process.on('uncaughtException', shutdown);
    process.on('SIGINT', shutdown);


    // refresh after restarting to resubscribe and update any new client code
    setTimeout(function() {
        io.sockets.emit('refresh');
    }, 5e3);

    io.sockets.on('connection', function(sock) {
        timeout = setInterval(function() {
            log.debug('sending refresh');
            sock.emit('refresh');
        }, HOUR_IN_MILLIS * 12); // send refresh signal every 12 hours

        // name:format
        sock.on('subscribe', function(channel_name) {
            log.debug('subscribe: ' + channel_name);
            tailer.addListener(sock, channel_name);
        });

        // name:format
        sock.on('unsubscribe', function(channel_name) {
            log.debug('unsubscribe: ' + channel_name);
            tailer.removeListener(sock, channel_name);
        });

        sock.on('disconnect', function() {
            clearInterval(timeout);
            tailer.removeListener(sock);
        });
    });
})();

