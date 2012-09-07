#!/bin/bash

# determine our base dirs
export TAILGATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export TAILGATE_WEB_DIR="$TAILGATE_DIR/web"
export PIDFILE="$TAILGATE_DIR/startup/tailgate.pid"

cd $TAILGATE_DIR

# write out the pid 
echo "$$" > $PIDFILE

export PATH="$TAILGATE_DIR/node_modules/.bin:$PATH"

# load env variables
. "$TAILGATE_DIR/conf/conf.sh"

# start this party
until "$TAILGATE_DIR/bin/tailgate.coffee" ; do
        echo "Tailgate crashed with exit code $?. Restarting." >&2
        sleep 1
done
