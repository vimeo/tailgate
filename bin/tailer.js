'use strict';

var fs = require('fs'),
    log = require('log4js').getLogger(),
    sprintf = require('sprintf').sprintf,
    spawn = require('child_process').spawn,
    crypto = require('crypto'),
    env = process.env;

function Tailer() {
    this.listeners = {};
    this.refs = {};
    this.tailers = {};
    this.timeout = null;
    this.formats = {
        // return an array of js data structures or just an array of strings if not parsable
        'json': function(data) {
            var r = [],
                lines = data.split(/\n+/);

            for (var line in lines) {
                if (lines.hasOwnProperty(line)) {
                    try {
                        line = JSON.parse(line);
                        r.push(line);
                    }
                    catch (e) {}
                }
            }

            return r;
        },

        'raw': function(data) {
            return data;
        }
    };
}

// evasive action
// kill all tailers
Tailer.prototype.shutdown = function() {
    for (var tailer in this.tailers) {
        if (this.tailers.hasOwnProperty(tailer)) {
            try {
                tailer.kill();
                delete this.tailers[tailer];
            }
            catch(err) {
                log.error(err);
            }
        }
    }
};

Tailer.prototype.addListener = function(sock, channel_name) {
    var parts = channel_name.split(':'),
        dir = parts[0],
        format = parts[1];

    if (!sock.id || !dir || !format) {
        log.warn('Bad listener data: ' + JSON.stringify(arguments));
        return;
    }

    if (!this.listeners[channel_name]) {
        this.listeners[channel_name] = {};
    }

    // don't double bind
    if (this.listeners[channel_name][sock.id]) {
        return;
    }

    if (this.register(dir)) {
        this.listeners[channel_name][sock.id] = sock;
    }
};


Tailer.prototype.removeListener = function(sock, channel_name) {
    if (!sock.id) {
        return log.warn('Bad socket specified: ' + JSON.stringify(arguments));
    }

    var parts,
        dir,
        format;

    // remove single channel listener if specified
    if (channel_name) {
        if (this.listeners[channel_name] && this.listeners[channel_name][sock.id]) {
            parts = channel_name.split(':');
            dir = parts[0];
            format = parts[1];
            this.unregister(dir);
            delete this.listeners[channel_name][sock.id];
        }
    }
    // otherwise clear out all listeners for the socket
    else {
        for (var socks in this.listeners) {
            if (this.listeners.hasOwnProperty(socks)) {
                if (!socks[sock.id]) {
                    continue;
                }

                parts = channel_name.split(':');
                dir = parts[0];
                format = parts[1];

                delete this.listeners[socks][sock.id];
                this.unregister(dir, format);
            }
        }
    }
};


Tailer.prototype.register = function(dir, format) {

    // track refs so we know when to kill the tail process
    this.refs[dir] = this.refs[dir] ? this.refs[dir] + 1 : 1;

    var self = this,
        path = env.TAILGATE_DATA_DIR + '/' + dir,
        file,
        tail;

    // @todo clean this up a lil
    if (env.TAILER !== 'dev') {
        try {
            if (!fs.statSync(path).isDirectory()) {
                log.warn(path + ' is not a valid directory');
                return;
            }

            file = sprintf('%s/' + env.TAILGATE_DATA_LOG, path, dir);

            if (!fs.statSync(file).isFile()) {
                log.warn(file + ' is not a valid file');
                return;
            }
        }
        catch(e) {
            log.error(e.toString());
            return;
        }
    }

    if (this.tailers[dir]) {
        return true;
    }

    tail = this.tailer_functions[env.TAILER];

    this.tailers[dir] = tail(file, function(data) {
        for (var transform in self.formats) {
            if (self.formats.hasOwnProperty(transform)) {
                var channel = dir + ':' + transform;

                if (self.listeners[channel]) {
                    var tdata = self.formats[transform](data);

                    for (var sock in self.listeners[channel]) {
                        if (self.listeners[channel].hasOwnProperty(sock)) {
                            self.listeners[channel][sock].emit(channel, tdata);
                        }
                    }
                }
            }
        }
    });

    return true;
};


Tailer.prototype.unregister = function(dir) {
    if (this.refs[dir]) {
        this.refs[dir]--;
    }

    log.debug(this.refs);

    if (this.refs[dir] <= 0) {
        try {
            this.tailers[dir].kill();
        }
        catch(err) {
            log.error(err);
        }
        delete this.tailers[dir];
    }
};

Tailer.prototype.tailer_functions = {
    // whatever is returned here must respond to a kill method
    // like the spawn child_process object does
    'tail': function(file, callback) {
        var t = spawn('tail', ['-F', file]);

        t.stdout.on('data', function(data) {
            callback(data.toString('utf8'));
        });

        t.stderr.on('data', function() {
            log.error(arguments);
        });

        return t;
    },

    'native': function(file, callback) {
        var watcher = null,
            s = null,
            prev_size = fs.statSync(file).size;

        watcher = fs.watch(file, function(event, filename) {

            var new_size = fs.statSync(file).size;

            if (new_size > prev_size) {
                s = fs.createReadStream(file, {
                    flags: 'r',
                    encoding: 'utf8',
                    bufferSize: new_size - prev_size,
                    start: prev_size,
                    end: new_size - 1
                });

                s.on('data', callback);

                prev_size = new_size;
            }
        });

        return {
            kill: function() {
                try {
                    watcher.close();
                }
                catch(err) {
                    log.error(err);
                }
            }
        };
    },

    'dev': function(file, callback) {
        var self = this;

        self.timeout = setInterval(function() {
            var a = '';

            while (Math.random() > 0.2) {
                a += JSON.stringify([new Date.getTime(), '<b style="color:red !important">alert(1)<\/b>&<&>', Math.random(), 'data data data', crypto.randomBytes(15)]) + '\n';
            }

            callback(a);
        }, 2e3);

        return {
            kill: function() {
                clearInterval(self.timeout);
            }
        };
    }
};

module.exports = Tailer;

