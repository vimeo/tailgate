#/bin/sh

# SET TAILGATE_DIR, AND TAILGATE_USER before running.
TAILGATE_DIR=
TAILGATE_USER=

#
# No modifications below this line are required
#
TAILGATE_SCRIPT=$TAILGATE_DIR/startup/tailgate_start.sh
PIDFILE=$TAILGATE_DIR/startup/tailgate.pid

# path needed for node and npm
export PATH="/usr/local/bin:$PATH"

# grab pid
PID=$(cat $PIDFILE 2> /dev/null)

start() {
        if [ -n "$PID" -a -d /proc/$PID ]; then
                echo "Tailgate is already running..."
        else
                echo "Starting Tailgate..."
                cd $TAILGATE_DIR

                sudo -u $TAILGATE_USER -b $TAILGATE_SCRIPT > /dev/null 2>&1 &
        fi
}
stop() {
        if [ ! -n "$PID" ]; then
                echo "Tailgate is not running..."
        else
                echo "Stopping Tailgate..."

                # grab the nodejs child process
                CPID=$(ps ax -o pid,ppid | grep " $PID$" | awk '{ print $1 }')

                kill -9 $PID
                kill -9 $CPID
                rm -f $PIDFILE

                echo "Tailgate stopped."
        fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        start
        ;;
    *)
        echo "Commands available: start|stop|restart"
        ;;
esac
