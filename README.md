# Tailgate

Tailgate is a [nodejs](http://nodejs.org) app to pipe `tail -F` into websockets.  

It's a very simple way to have real-time access to your logs.  It uses [socket.io](http://socket.io) and [coffeescript](http://coffeescript.org), and is great for keeping track of [scribe logs](https://github.com/facebook/scribe).

![Tailgate](http://cl.ly/image/313P243p0L0N/Screen%20Shot%202012-09-10%20at%204.35.08%20PM.png)

## API
Tailgate exposes its feeds as a simple pub/sub api through [socket.io](http://socket.io) connections making it easy to build visualizations or monitoring tools as simple web pages.

## Installation
	
	cd <install/directory>
	git clone git@github.com:vimeo/tailgate.git
	cd tailgate
	npm install
	cp conf/conf-dist.sh conf/conf.sh

Edit `conf/conf.sh` to have the correct values for your installation.

#### Optional
If you want to use the `init.d.sh` script.

	cp startup/init.d-dist.sh startup/init.d.sh
	sudo ln -s <fullpath to tailgate/startup/init.d.sh> /etc/init.d/tailgate

Edit the `startup/init.d.sh` script to use the installation directory and tailgate user to run as.  Ensure the tailgate user has write permissions to `startup/` so that it can write the pidfile.

	sudo /etc/init.d/tailgate start
	sudo /etc/init.d/tailgate stop
	sudo /etc/init.d/tailgate restart


## Troubleshooting
	
* Make sure the HTTP port specified in `conf/conf.sh` is not already in use
* Enable logging in `conf.sh` by setting `LOGGING="1"`
