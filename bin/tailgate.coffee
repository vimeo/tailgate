#!/usr/bin/env coffee

env     = process.env
fs 		= require "fs"
express	= require "express"
spawn	= require("child_process").spawn
crypto  = require "crypto"
app		= express()

if env.SSL_KEY_FILE?
	server = require("https").createServer(
		key:  fs.readFileSync(env.SSL_KEY_FILE,  'utf8')
		cert: fs.readFileSync(env.SSL_CRT_FILE, 'utf8')
		ca:   fs.readFileSync(env.SSL_BUNDLE_FILE, 'utf8')
	, app).listen(env.TAILGATE_HTTPS_PORT)
else
	server = app.listen(env.TAILGATE_HTTP_PORT)

io = require("socket.io").listen(server)

HOUR_IN_MILLIS = 60*60e3

if env.AUTH_TYPE is "ldap"
	ldap 	= require "ldapjs"
	sprintf = require('sprintf').sprintf

log4js = require "log4js"
log = log4js.getLogger()

if env.LOGGING == "1"
	log.setLevel "ALL"
	io.set "log level", 3
else
	log.setLevel "WARN"
	io.set "log level", 0

log.info "Starting up Tailgate.."


# set up static content
app.use "/js",  express.static(env.TAILGATE_WEB_DIR+"/js");
app.use "/css", express.static(env.TAILGATE_WEB_DIR+"/css");
app.use "/img", express.static(env.TAILGATE_WEB_DIR+"/img");

# set rendering lib
app.set "view engine", "ejs"
app.set "view options", "layout": false

app.use express.favicon(env.TAILGATE_WEB_DIR+"/favicon.ico", { maxAge: 2592000000 })

requestAuth = (res) ->
	res.set "WWW-Authenticate", 'Basic realm="Tailgate Authentication"'
	res.send 401


# hash the passwords stored in memory
SALT = crypto.randomBytes 256
genPass = (password) ->
	sha = crypto.createHmac('sha256', SALT)
	sha.update(password)
	return sha.digest('hex')

authCheck = (req, res, next) ->

	if env.SSL_CERT_FILE? and not req.secure
		return res.redirect("https://"+req.host+":"+env.TAILGATE_HTTPS_PORT+"/"+req.url)

	if env.AUTH_TYPE is "none"
	  return next()

	# extract the user:pass from the header
	if req.headers.authorization?
		[req.username, req.password] = new Buffer(req.headers.authorization.split(" ")[1], 'base64').toString('utf8').split(":")

	unless req.username and req.password
		return requestAuth res

	switch env.AUTH_TYPE
		when "ldap" then ldapAuth(req, res, next)
		when "simple" then simpleAuth(req, res, next)
		else next()

simpleAuth = (req, res, next) ->

	unless env.SIMPLE_USERNAME and env.SIMPLE_PASSWORD
		res.send 403, "Authentication required but not defined in config!"

	if req.username is env.SIMPLE_USERNAME and req.password is env.SIMPLE_PASSWORD
		return next()

	requestAuth()

ldapAuth = (req, res, next) ->

	# if it's cached go for it
	if env.LDAP_CACHE is "true" and ldapAuth.cache[req.username]? and genPass(req.password) == ldapAuth.cache[req.username]
		return next()

	ldapAuthClient = ldap.createClient
		url: env.LDAP_URL
		log4js: log4js

	opts =
		scope: "sub"
		attributes: "dn"
		filter: sprintf(env.LDAP_SEARCH_FILTER, req.username)

	log.debug opts

	ldapAuthClient.search env.LDAP_SEARCH_BASE, opts, (err, ldap_res) ->

		matches = []

		if err?
			log.error err
			return requestAuth res

		ldap_res.on "error", (err) ->
			log.error err
			requestAuth res

		ldap_res.on "searchEntry", (entry) ->
			if entry.dn
				matches.push entry.dn

		ldap_res.on "end", (result) ->

			log.debug matches

			if matches.length == 1
				ldapAuthClient.bind matches[0], req.password, (err) ->
					if err?
						log.error err
						requestAuth res
					else
						if env.LDAP_CACHE is "true"
							ldapAuth.cache[req.username] = genPass(req.password)
						next()
			else
				requestAuth res

# initialize the ldap cache
ldapAuth.cache = {}

get_dirs = () ->
	if env.TAILER is "dev"
		return ['dev1','dev2','dev3']
	return ((fs.readdirSync env.TAILGATE_DATA_DIR).filter (file) ->
			return (fs.statSync env.TAILGATE_DATA_DIR+"/"+file).isDirectory()).sort()


# el monitor
app.get "/", authCheck, (req, res) ->

	dirs = get_dirs()

	res.render env.TAILGATE_WEB_DIR + "/index.ejs", "dirs": dirs, "host": req.headers.host, "repo": env.REPO_LINK

app.get "/api", authCheck, (req, res) ->

	dirs = get_dirs()

	res.render env.TAILGATE_WEB_DIR + "/api.ejs", "dirs": dirs, "host": req.headers.host, "repo": env.REPO_LINK


class Tailer

	constructor: () ->
		@listeners = {}
		@refs = {}
		@tailers = {}
		@formats = {
			# return an array of js data structures or just an array of strings if not parsable
			"json": (data) ->
				r = []
				for line in data.split /\n+/
					try
						line = JSON.parse(line)
					catch e
					r.push line if line
				return r

			"raw": (data) -> return data
		}

	# evasive action
	# kill all tailers
	shutdown: () ->
		for dir, tailer of @tailers
			try
				tailer.kill()
				delete @tailers[dir]
			catch err
				log.error err

	addListener: (sock, channel_name) ->

		[dir, format] = channel_name.split ":"

		unless sock.id? and dir? and format?
			log.warn "Bad listener data: "+JSON.stringify arguments
			return

		unless channel_name of @listeners
			@listeners[channel_name] = {}

		# don't double bind
		if @listeners[channel_name][sock.id]?
			return

		if @register dir
			@listeners[channel_name][sock.id] = sock


	removeListener: (sock, channel_name) ->

		unless sock.id?
			log.warn "Bad socket specified: "+JSON.stringify arguments
			return

		# remove single channel listener if specified
		if channel_name?
			if @listeners[channel_name]? and @listeners[channel_name][sock.id]
				[dir, format] = channel_name.split ":"
				@unregister dir
				delete @listeners[channel_name][sock.id]

		# otherwise clear out all listeners for the socket
		else
			for ch, socks of @listeners
				if socks[sock.id]?
					[dir, format] = ch.split ":"
					delete @listeners[ch][sock.id]
					@unregister dir, format


	register: (dir, format) ->

		# track refs so we know when to kill the tail process
		@refs[dir] = if @refs[dir]? @refs[dir]+1 else 1

		path = env.TAILGATE_DATA_DIR+"/"+dir

		# @todo clean this up a lil
		unless env.TAILER is "dev"
			try
				unless fs.statSync(path).isDirectory()
					log.warn path+" is not a valid directory"
					return

				file = sprintf "%s/"+env.TAILGATE_DATA_LOG, path, dir

				unless fs.statSync(file).isFile()
					log.warn file+" is not a valid file"
					return
			catch e
				log.error e.toString()
				return

		if @tailers[dir]?
			return true

		self = @
		tail = @tailer_functions[env.TAILER]

		@tailers[dir] = tail file, (data) ->

			for f, transform of self.formats

				channel = dir+":"+f

				if channel of self.listeners

					tdata = transform(data)

					for id, sock of self.listeners[channel]
						sock.emit(channel, tdata)

		return true



	unregister: (dir) ->

		@refs[dir]-- if @refs[dir]?

		log.debug @refs

		if @refs[dir] <= 0
			try
				@tailers[dir].kill()
			catch err
				log.error err
			delete @tailers[dir]


	tailer_functions: {
		# whatever is returned here must respond to a kill method
		# like the spawn child_process object does
		tail: (file, callback) ->
			t = spawn "tail", ["-F", file]
			t.stdout.on "data", (data) -> callback(data.toString "utf8")
			t.stderr.on "data", () -> log.error arguments
			return t

		native: (file, callback) ->
			watcher = null
			s = null
			prev_size = (fs.statSync file).size

			watcher = fs.watch file, (event, filename) ->

				new_size = (fs.statSync file).size

				if new_size > prev_size
					s = fs.createReadStream file, {
						flags: "r"
						encoding: "utf8"
						bufferSize: new_size-prev_size
						start: prev_size
						end: new_size-1
					}
					s.on "data", callback

					prev_size = new_size

			return {
				kill: () ->
					try
						watcher.close()
					catch err
						log.error err
			}

		dev: (file, callback) ->
			self = @
			timeout = setInterval(() ->
				a = ""
				a += JSON.stringify([Date.now(),'<b style="color:red !important">alert(1)<\/b>&<&>', Math.random(), "data data data", crypto.randomBytes 15])+"\n" while Math.random() > .2
				callback a
			, 2e3)
			return {
				kill: () -> clearInterval timeout
			}
	}

tailer = new Tailer

# handle killing tailers on shutdown
shutdown = () ->
	try
	  log.warn "Received shutdown signal!  shutting down.."
	  tailer.shutdown()
	  process.exit 1
	catch err
	  console.log err

process.on 'uncaughtException', shutdown
process.on 'SIGINT', shutdown


# refresh after restarting to resubscribe and update any new client code
setTimeout () ->
	io.sockets.emit "refresh"
, 5e3

io.sockets.on "connection", (sock) ->

	timeout = setInterval () ->
		log.debug "sending refresh"
		sock.emit "refresh"
	, HOUR_IN_MILLIS*12 # send refresh signal every 12 hours

	# name:format
	sock.on "subscribe", (channel_name) ->
		log.debug "subscribe: "+channel_name
		tailer.addListener sock, channel_name

	# name:format
	sock.on "unsubscribe", (channel_name) ->
		log.debug "unsubscribe: "+channel_name
		tailer.removeListener sock, channel_name

	sock.on "disconnect", () ->
		clearInterval timeout
		tailer.removeListener sock



